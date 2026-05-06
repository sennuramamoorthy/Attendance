"""Admin user management — single-user create + bulk onboarding.

Three endpoints, all admin-gated:

* `GET  /admin/users/pending` — public.users rows that don't yet have a
  matching gotrue auth account. Bulk-uploaded students/faculty land here.
* `POST /admin/users/onboard` — for each user_id, create gotrue auth +
  rebind FKs + return the freshly-generated password (one-time reveal).
* `POST /admin/users/create` — single-user create with role assignment.
  Validates role-specific requirements (CIC needs a section, faculty needs
  employee_id + department, etc.) and provisions auth in the same call.
"""

from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, require_role
from app.core.database import get_db
from app.models.academic import Department, Program, School, Section
from app.models.user import FacultyMember, Student, User, UserRole
from app.services.gotrue_admin import list_auth_users
from app.services.user_provisioning import (
    ProvisionResult,
    generate_password,
    provision_user,
)

router = APIRouter()


# ─── Pending list ────────────────────────────────────────


class PendingUser(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    phone: str | None
    role: str  # "student" | "faculty" | "cic" | "hod" | etc.
    entity_label: str | None  # human-readable section/dept/school for the role


@router.get("/users/pending", response_model=list[PendingUser])
async def list_pending_users(
    _: Annotated[CurrentUser, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PendingUser]:
    """Users who exist in public.users but have no matching gotrue auth account.

    A user is pending if (email NOT in gotrue) OR (gotrue uuid != users.id).
    The latter shouldn't happen in practice but guards against drift.
    """
    auth_index = await list_auth_users()

    # Pull every user with their primary role + scoping label.
    user_rows = (
        await db.execute(
            select(User.id, User.email, User.full_name, User.phone)
            .order_by(User.email)
        )
    ).all()

    # Pre-fetch role rows in bulk so we can pick a "primary" role per user.
    role_rows = (
        await db.execute(
            select(UserRole.user_id, UserRole.role, UserRole.scope_type, UserRole.scope_id)
            .order_by(UserRole.created_at)
        )
    ).all()
    roles_by_user: dict[UUID, list[tuple[str, str, UUID | None]]] = {}
    for uid, role, scope_type, scope_id in role_rows:
        roles_by_user.setdefault(uid, []).append((role, scope_type, scope_id))

    # Lookup tables for label resolution
    schools_by_id = {
        s.id: s for s in (await db.execute(select(School))).scalars().all()
    }
    depts_by_id = {
        d.id: d for d in (await db.execute(select(Department))).scalars().all()
    }
    sections_with_program = (
        await db.execute(
            select(Section, Program)
            .join(Program, Section.program_id == Program.id)
        )
    ).all()
    sections_by_id = {sec.id: (sec, prog) for sec, prog in sections_with_program}

    def label_for(role: str, scope_type: str, scope_id: UUID | None) -> str | None:
        if not scope_id:
            return None
        if scope_type == "school":
            s = schools_by_id.get(scope_id)
            return f"{s.code} · {s.name}" if s else None
        if scope_type == "department":
            d = depts_by_id.get(scope_id)
            return f"{d.code} · {d.name}" if d else None
        if scope_type == "section":
            row = sections_by_id.get(scope_id)
            if not row:
                return None
            sec, prog = row
            return f"{prog.code} · Y{sec.year} {sec.division}"
        return None

    # Priority order — when a user has multiple roles, show the most specific.
    priority = ["cic", "hod", "dean", "faculty", "student", "admin", "registrar", "vc", "chancellor"]

    out: list[PendingUser] = []
    for uid, email, full_name, phone in user_rows:
        auth_id = auth_index.get(email.lower())
        if auth_id is not None and auth_id == uid:
            continue  # provisioned

        roles = roles_by_user.get(uid, [])
        role_name = "—"
        entity_label = None
        if roles:
            roles.sort(key=lambda r: priority.index(r[0]) if r[0] in priority else 99)
            role_name, scope_type, scope_id = roles[0]
            entity_label = label_for(role_name, scope_type, scope_id)

        out.append(
            PendingUser(
                user_id=uid,
                email=email,
                full_name=full_name,
                phone=phone,
                role=role_name,
                entity_label=entity_label,
            )
        )
    return out


# ─── Onboard (bulk provision) ────────────────────────────


class OnboardRequest(BaseModel):
    user_ids: list[UUID] = Field(default_factory=list)
    onboard_all_pending: bool = False


class OnboardResultRow(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    password: str | None
    status: str  # "ok" | "already_provisioned" | "error"
    error: str | None = None


class OnboardResponse(BaseModel):
    total: int
    provisioned: int
    already: int
    failed: int
    results: list[OnboardResultRow]


def _to_row(r: ProvisionResult) -> OnboardResultRow:
    return OnboardResultRow(
        user_id=r.user_id,
        email=r.email,
        full_name=r.full_name,
        password=r.password,
        status=r.status,
        error=r.error,
    )


@router.post("/users/onboard", response_model=OnboardResponse)
async def onboard_users(
    body: OnboardRequest,
    _: Annotated[CurrentUser, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OnboardResponse:
    """Provision auth accounts for the given user_ids.

    Each result row contains the generated password — admins must capture
    these immediately, we do not store plaintext anywhere. Already-provisioned
    users return `status='already_provisioned'` and `password=null`.
    """
    auth_index = await list_auth_users()

    target_ids: list[UUID] = list(body.user_ids)

    if body.onboard_all_pending:
        # Compute pending set in-process (same logic as /pending) and merge.
        all_users = (
            await db.execute(select(User.id, User.email))
        ).all()
        pending = [
            uid for uid, email in all_users
            if auth_index.get(email.lower()) != uid
        ]
        target_ids = list({*target_ids, *pending})

    if not target_ids:
        raise HTTPException(
            status_code=400,
            detail="No user_ids provided and onboard_all_pending=False",
        )

    rows: list[OnboardResultRow] = []
    for uid in target_ids:
        result = await provision_user(db, uid, auth_index=auth_index)
        rows.append(_to_row(result))
        # Refresh local index so subsequent users see the new auth state.
        if result.status == "ok":
            auth_index[result.email.lower()] = result.user_id

    await db.commit()

    provisioned = sum(1 for r in rows if r.status == "ok")
    already = sum(1 for r in rows if r.status == "already_provisioned")
    failed = sum(1 for r in rows if r.status == "error")

    return OnboardResponse(
        total=len(rows),
        provisioned=provisioned,
        already=already,
        failed=failed,
        results=rows,
    )


# ─── Single-user create (with role + auth) ───────────────


# Roles that bind to a Department-level scope.
_DEPT_SCOPED = {"hod", "faculty"}
# Roles that bind to a School-level scope.
_SCHOOL_SCOPED = {"dean"}
# Roles that bind to a Section-level scope.
_SECTION_SCOPED = {"cic", "student"}
# Roles with no scope (administrative).
_GLOBAL_ROLES = {"admin", "registrar", "vc", "chancellor"}


class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    phone: str | None = None
    role: Literal[
        "admin", "student", "faculty", "cic",
        "hod", "dean", "registrar", "vc", "chancellor",
    ]

    # Scope IDs — required based on role:
    school_id: UUID | None = None       # required for dean
    department_id: UUID | None = None   # required for hod/faculty
    section_id: UUID | None = None      # required for cic/student

    # Faculty-specific
    employee_id: str | None = None

    # Student-specific
    enrollment_no: str | None = None
    admitted_year: int | None = None

    # If true, create gotrue auth account and return generated password.
    # When false, only the public.users row + role are created (admin can
    # onboard later from the pending list).
    provision: bool = True


class CreateUserResponse(BaseModel):
    user_id: UUID
    email: str
    full_name: str
    role: str
    password: str | None  # null when provision=False
    provisioned: bool


def _validate_role_payload(body: CreateUserRequest) -> tuple[str, UUID | None]:
    """Return (scope_type, scope_id) for the role; raises HTTPException on bad payload."""
    role = body.role

    if role in _GLOBAL_ROLES:
        return "global", None

    if role in _SCHOOL_SCOPED:
        if not body.school_id:
            raise HTTPException(status_code=400, detail=f"{role} requires school_id")
        return "school", body.school_id

    if role in _DEPT_SCOPED:
        if not body.department_id:
            raise HTTPException(status_code=400, detail=f"{role} requires department_id")
        if role == "faculty" and not body.employee_id:
            raise HTTPException(status_code=400, detail="faculty requires employee_id")
        return "department", body.department_id

    if role in _SECTION_SCOPED:
        if not body.section_id:
            raise HTTPException(status_code=400, detail=f"{role} requires section_id (a class assignment)")
        if role == "student":
            if not body.enrollment_no:
                raise HTTPException(status_code=400, detail="student requires enrollment_no")
            if not body.admitted_year:
                raise HTTPException(status_code=400, detail="student requires admitted_year")
        return "section", body.section_id

    raise HTTPException(status_code=400, detail=f"Unknown role: {role}")


@router.post("/users/create", response_model=CreateUserResponse)
async def create_user(
    body: CreateUserRequest,
    _: Annotated[CurrentUser, Depends(require_role("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CreateUserResponse:
    """Create a user with role + (optionally) provision an auth account.

    For role=cic, a class (section) assignment is mandatory. The endpoint
    also flips the section's `cic_user_id` so dashboards reflect ownership.
    For role=faculty/student, the corresponding entity row is created in
    addition to the user_role assignment.
    """
    scope_type, scope_id = _validate_role_payload(body)

    # Resolve dept_id for faculty (since it lives on FacultyMember, not just role)
    dept_id = body.department_id
    if body.role == "cic" or body.role == "student":
        # CIC's "department" comes from the section's program → dept
        section = (
            await db.execute(select(Section).where(Section.id == body.section_id))
        ).scalar_one_or_none()
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")

    # Insert the public.users row first (random uuid; provision step rebinds).
    new_id = uuid4()
    db.add(
        User(
            id=new_id,
            email=body.email,
            full_name=body.full_name,
            phone=body.phone,
        )
    )
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="Email already exists"
        ) from e

    # Attach role-specific entity rows.
    if body.role == "faculty":
        db.add(
            FacultyMember(
                user_id=new_id,
                employee_id=body.employee_id,  # validated above
                department_id=dept_id,         # validated above
            )
        )
    elif body.role == "student":
        db.add(
            Student(
                user_id=new_id,
                enrollment_no=body.enrollment_no,  # validated above
                section_id=body.section_id,
                admitted_year=body.admitted_year,
            )
        )

    db.add(
        UserRole(
            user_id=new_id,
            role=body.role,
            scope_type=scope_type,
            scope_id=scope_id,
        )
    )

    # CIC ownership: stamp the section's cic_user_id so the roster endpoint
    # picks this user up. (Idempotent — overwrites whoever was there.)
    if body.role == "cic" and body.section_id:
        sec = (
            await db.execute(select(Section).where(Section.id == body.section_id))
        ).scalar_one()
        sec.cic_user_id = new_id

    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Conflict — duplicate enrollment_no or employee_id",
        ) from e

    # Optionally provision the auth account immediately. This rebinds the
    # user.id to the gotrue UUID, so we re-read user_id from the result.
    password: str | None = None
    final_user_id = new_id
    if body.provision:
        # Pre-flush so the row is visible to the provisioning lookup.
        await db.flush()
        result = await provision_user(db, new_id)
        if result.status == "error":
            await db.rollback()
            raise HTTPException(
                status_code=502,
                detail=f"Auth provisioning failed: {result.error}",
            )
        password = result.password
        final_user_id = result.user_id
    else:
        # Generate a placeholder hint password but DON'T set it — admin can
        # decide later. We just leave the field null.
        _ = generate_password  # silence unused-import in this branch

    await db.commit()

    return CreateUserResponse(
        user_id=final_user_id,
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        password=password,
        provisioned=body.provision,
    )
