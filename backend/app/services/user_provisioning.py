"""Onboarding helper — turns a `public.users` row into a working login.

When admins bulk-upload students or faculty, we create rows in `public.users`
with random UUIDs but *no* gotrue auth account. Those users can't log in.

This module bridges the gap:
  1. Generate a random 8-10 char password.
  2. Create the gotrue auth account.
  3. Rebind `public.users.id` (and dependent FK rows) to the gotrue UUID
     so `get_current_user` can find the row by JWT `sub`.

The rebind pattern mirrors `scripts/seed_demo.upsert_faculty_with_login` —
we rename the legacy email out of the way (UNIQUE constraint), insert the new
row with the gotrue UUID, repoint child tables, then drop the legacy row.
"""

from __future__ import annotations

import secrets
import string
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.academic import Section
from app.models.user import FacultyMember, Student, User, UserRole
from app.services.gotrue_admin import list_auth_users, upsert_auth_user

# ─── Password generation ─────────────────────────────────


_PW_ALPHABET = string.ascii_letters + string.digits


def generate_password(length: int = 10) -> str:
    """Random 8–10 char alphanumeric password.

    Defaults to 10. Always contains at least one uppercase, one lowercase,
    and one digit so the result satisfies common password policies.
    """
    if length < 4:
        raise ValueError("length must be >= 4")
    chars = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
    ]
    while len(chars) < length:
        chars.append(secrets.choice(_PW_ALPHABET))
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


# ─── Provisioning ────────────────────────────────────────


@dataclass
class ProvisionResult:
    user_id: UUID  # the FINAL user_id (= gotrue uuid after rebind)
    email: str
    full_name: str
    password: str | None  # None means already-provisioned (no new password set)
    status: str  # "ok" | "already_provisioned" | "error"
    error: str | None = None


async def _rebind_user_id(db: AsyncSession, legacy: User, new_id: UUID) -> User:
    """Move all FKs from legacy.id to new_id, returning the new User row.

    Steps (order matters because of UNIQUE(email) and FK constraints):
      1. Free up the email by renaming the legacy row.
      2. INSERT the new public.users row with new_id and original email.
      3. Update FK references in students / faculty_members / user_roles
         and any sections.cic_user_id pointing at legacy.
      4. Delete the legacy row.
    """
    legacy_id = legacy.id
    legacy_email = legacy.email
    legacy_name = legacy.full_name
    legacy_phone = legacy.phone
    legacy_avatar = legacy.avatar_url

    # 1. release UNIQUE email
    legacy.email = f"_legacy_{legacy_id}@migrate.local"
    await db.flush()

    # 2. insert new row
    new_user = User(
        id=new_id,
        email=legacy_email,
        full_name=legacy_name,
        phone=legacy_phone,
        avatar_url=legacy_avatar,
    )
    db.add(new_user)
    await db.flush()

    # 3. repoint dependent FKs
    await db.execute(
        Student.__table__.update()
        .where(Student.user_id == legacy_id)
        .values(user_id=new_id)
    )
    await db.execute(
        FacultyMember.__table__.update()
        .where(FacultyMember.user_id == legacy_id)
        .values(user_id=new_id)
    )
    await db.execute(
        UserRole.__table__.update()
        .where(UserRole.user_id == legacy_id)
        .values(user_id=new_id)
    )
    await db.execute(
        Section.__table__.update()
        .where(Section.cic_user_id == legacy_id)
        .values(cic_user_id=new_id)
    )

    # 4. drop the orphan legacy row
    await db.delete(legacy)
    await db.flush()

    return new_user


async def provision_user(
    db: AsyncSession,
    user_id: UUID,
    auth_index: dict[str, UUID] | None = None,
) -> ProvisionResult:
    """Onboard a single public.users row.

    `auth_index` is an optional pre-fetched {email: gotrue_id} map used
    when provisioning many users in one request — avoids re-paginating
    gotrue for every call. If omitted, we fetch a fresh map.
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        return ProvisionResult(
            user_id=user_id, email="", full_name="",
            password=None, status="error", error="User not found",
        )

    if auth_index is None:
        auth_index = await list_auth_users()
    existing_auth_id = auth_index.get(user.email.lower())

    # Already has matching auth account → nothing to do.
    if existing_auth_id and existing_auth_id == user.id:
        return ProvisionResult(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            password=None,
            status="already_provisioned",
        )

    password = generate_password(10)

    try:
        # Either creates a new gotrue user or updates the password of the
        # existing one (returns the gotrue uuid in both cases).
        gotrue_id = await upsert_auth_user(user.email, password)
    except Exception as e:  # noqa: BLE001 — surface the gotrue error to admin
        return ProvisionResult(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            password=None,
            status="error",
            error=f"gotrue: {e}",
        )

    # If the public.users.id already matches gotrue, no rebind needed.
    if user.id == gotrue_id:
        return ProvisionResult(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            password=password,
            status="ok",
        )

    # Rebind FKs so login by JWT sub finds the row.
    new_user = await _rebind_user_id(db, user, gotrue_id)
    return ProvisionResult(
        user_id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        password=password,
        status="ok",
    )
