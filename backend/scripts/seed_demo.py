"""Demo seed: creates a working login for every role plus realistic data.

What it builds (idempotent — safe to re-run):

  Logins (all password: Demo@123)
  ──────────────────────────────
  registrar@takshashila.edu      registrar (global)
  vc@takshashila.edu             vice-chancellor (global)
  chancellor@takshashila.edu     chancellor (global)
  dean.eng@takshashila.edu       dean (school: ENG)
  dean.med@takshashila.edu       dean (school: MED)
  hod.cs@takshashila.edu         hod (department: ENG-01 Computer Science)
  hod.ee@takshashila.edu         hod (department: ENG-02 Electronics)
  cic.cs.y3a@takshashila.edu     cic (section: BTECH-CSE Y3 A)
  faculty1..3@takshashila.edu    faculty (3 existing CS faculty get logins)
  fac.ec.<n>@...                 2 ECE faculty
  student1..30@takshashila.edu   30 students across 3 CS sections (Y1A, Y2A, Y3A)
                                 + 10 ECE students in BTECH-ECE Y1A

  Academic structure
  ──────────────────
  Adds BTECH-CSE Y1 A and Y2 A sections to existing program.
  Adds BTECH-ECE program (ENG-02) with Y1 A section.
  Subject assignments + class schedules for all sections.

  Attendance history
  ──────────────────
  ~5 closed sessions per assignment (across last 14 days)
  with realistic attendance distribution (90-95% present).
  Populates dashboards with meaningful numbers.

Requires: db migrated, base seed (`make seed`) run, gotrue running.
"""

import asyncio
import random
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.academic import (
    ClassSchedule,
    Department,
    Program,
    School,
    SchoolPeriod,
    Section,
    Subject,
    SubjectAssignment,
)
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import FacultyMember, Student, User, UserRole
from app.services.gotrue_admin import upsert_auth_user
from app.services.qr_service import generate_session_secret

DEMO_PASSWORD = "Demo@123"
random.seed(42)  # deterministic


# ─── Helpers ─────────────────────────────────────────────


async def upsert_user_with_role(
    db: AsyncSession,
    email: str,
    full_name: str,
    role: str,
    scope_type: str = "global",
    scope_id: UUID | None = None,
    phone: str | None = None,
) -> UUID:
    """Create gotrue + public.users + user_roles for a role-only user. Returns user_id."""
    user_id = await upsert_auth_user(email, DEMO_PASSWORD)

    existing = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not existing:
        db.add(User(id=user_id, email=email, full_name=full_name, phone=phone))
        await db.flush()

    role_exists = (
        await db.execute(
            select(UserRole).where(
                UserRole.user_id == user_id,
                UserRole.role == role,
                UserRole.scope_type == scope_type,
            )
        )
    ).scalars().first()
    if not role_exists:
        db.add(
            UserRole(
                user_id=user_id, role=role, scope_type=scope_type, scope_id=scope_id
            )
        )
        await db.flush()

    return user_id


async def upsert_faculty_with_login(
    db: AsyncSession,
    email: str,
    full_name: str,
    employee_id: str,
    department_id: UUID,
) -> UUID:
    """Returns FacultyMember.id. Reuses existing user/faculty rows if present."""
    user_id = await upsert_auth_user(email, DEMO_PASSWORD)

    legacy = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if legacy and legacy.id != user_id:
        # Base seed created this row with a random UUID. Re-point FKs to the gotrue
        # UUID so logins work. Order matters because of the email UNIQUE constraint
        # and because faculty_members / user_roles have FKs to users.
        legacy_id = legacy.id
        legacy_phone = legacy.phone
        # 1. Release the UNIQUE email so we can INSERT the new row
        legacy.email = f"_legacy_{legacy_id}@migrate.local"
        await db.flush()
        # 2. INSERT the new public.users row with the gotrue UUID and original email
        db.add(User(id=user_id, email=email, full_name=full_name, phone=legacy_phone))
        await db.flush()
        # 3. Re-point dependent rows
        await db.execute(
            FacultyMember.__table__.update()
            .where(FacultyMember.user_id == legacy_id)
            .values(user_id=user_id)
        )
        await db.execute(
            UserRole.__table__.update()
            .where(UserRole.user_id == legacy_id)
            .values(user_id=user_id)
        )
        # 4. Drop the orphan legacy row
        await db.delete(legacy)
        await db.flush()

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        db.add(User(id=user_id, email=email, full_name=full_name))
        await db.flush()

    fac = (
        await db.execute(
            select(FacultyMember).where(FacultyMember.user_id == user_id)
        )
    ).scalars().first()
    if not fac:
        fac = FacultyMember(
            user_id=user_id, employee_id=employee_id, department_id=department_id
        )
        db.add(fac)
        await db.flush()

    role_exists = (
        await db.execute(
            select(UserRole).where(
                UserRole.user_id == user_id, UserRole.role == "faculty"
            )
        )
    ).scalars().first()
    if not role_exists:
        db.add(
            UserRole(
                user_id=user_id,
                role="faculty",
                scope_type="department",
                scope_id=department_id,
            )
        )
        await db.flush()

    return fac.id


async def upsert_student_with_login(
    db: AsyncSession,
    email: str,
    full_name: str,
    enrollment_no: str,
    section_id: UUID,
    admitted_year: int,
) -> UUID:
    """Returns Student.id."""
    user_id = await upsert_auth_user(email, DEMO_PASSWORD)

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        db.add(User(id=user_id, email=email, full_name=full_name))
        await db.flush()

    stu = (
        await db.execute(select(Student).where(Student.user_id == user_id))
    ).scalars().first()
    if not stu:
        stu = Student(
            user_id=user_id,
            enrollment_no=enrollment_no,
            section_id=section_id,
            admitted_year=admitted_year,
        )
        db.add(stu)
        await db.flush()

    role_exists = (
        await db.execute(
            select(UserRole).where(
                UserRole.user_id == user_id,
                UserRole.role == "student",
                UserRole.scope_type == "section",
            )
        )
    ).scalars().first()
    if not role_exists:
        db.add(
            UserRole(
                user_id=user_id,
                role="student",
                scope_type="section",
                scope_id=section_id,
            )
        )
        await db.flush()

    return stu.id


async def get_or_create_section(
    db: AsyncSession, program_id: UUID, year: int, division: str
) -> UUID:
    sec = (
        await db.execute(
            select(Section).where(
                Section.program_id == program_id,
                Section.year == year,
                Section.division == division,
            )
        )
    ).scalars().first()
    if sec:
        return sec.id
    sec = Section(program_id=program_id, year=year, division=division)
    db.add(sec)
    await db.flush()
    return sec.id


async def get_or_create_program(
    db: AsyncSession, code: str, name: str, department_id: UUID, duration_years: int = 4
) -> UUID:
    prog = (
        await db.execute(select(Program).where(Program.code == code))
    ).scalars().first()
    if prog:
        return prog.id
    prog = Program(
        code=code, name=name, department_id=department_id, duration_years=duration_years
    )
    db.add(prog)
    await db.flush()
    return prog.id


async def get_or_create_subject(
    db: AsyncSession,
    code: str,
    name: str,
    department_id: UUID,
    credits: int = 3,
    type_: str = "theory",
) -> UUID:
    s = (await db.execute(select(Subject).where(Subject.code == code))).scalar_one_or_none()
    if s:
        return s.id
    s = Subject(
        code=code, name=name, department_id=department_id, credits=credits, type=type_
    )
    db.add(s)
    await db.flush()
    return s.id


async def get_or_create_assignment(
    db: AsyncSession,
    subject_id: UUID,
    faculty_id: UUID,
    section_id: UUID,
    academic_year: int = 2025,
    term: int = 1,
) -> UUID:
    a = (
        await db.execute(
            select(SubjectAssignment).where(
                SubjectAssignment.subject_id == subject_id,
                SubjectAssignment.section_id == section_id,
            )
        )
    ).scalars().first()
    if a:
        # Update faculty if changed
        if a.faculty_id != faculty_id:
            a.faculty_id = faculty_id
            await db.flush()
        return a.id
    a = SubjectAssignment(
        subject_id=subject_id,
        faculty_id=faculty_id,
        section_id=section_id,
        academic_year=academic_year,
        term=term,
    )
    db.add(a)
    await db.flush()
    return a.id


async def get_or_create_schedule(
    db: AsyncSession,
    assignment_id: UUID,
    day_of_week: int,
    start: time,
    end: time,
    room: str,
) -> None:
    existing = (
        await db.execute(
            select(ClassSchedule).where(
                ClassSchedule.subject_assignment_id == assignment_id,
                ClassSchedule.day_of_week == day_of_week,
                ClassSchedule.start_time == start,
            )
        )
    ).scalars().first()
    if existing:
        return
    db.add(
        ClassSchedule(
            subject_assignment_id=assignment_id,
            day_of_week=day_of_week,
            start_time=start,
            end_time=end,
            room=room,
        )
    )
    await db.flush()


# ─── School-level period grid ─────────────────────────
# Indian universities run a fixed grid of back-to-back periods that all
# sections in a school share. Students stay in their classroom; faculty
# rotate. Labs span 2 consecutive periods in the afternoon (after lunch).

# (period_number, start, end, label, is_break). Periods 1–4 are morning,
# 5 is the lunch break (no class), 6–8 afternoon. No gaps between teaching
# periods — bell-to-bell.
DEFAULT_PERIOD_GRID: list[tuple[int, time, time, str, bool]] = [
    (1, time(9, 0), time(9, 50), "Period 1", False),
    (2, time(9, 50), time(10, 40), "Period 2", False),
    (3, time(10, 40), time(11, 30), "Period 3", False),
    (4, time(11, 30), time(12, 20), "Period 4", False),
    (5, time(12, 20), time(13, 10), "Lunch", True),
    (6, time(13, 10), time(14, 0), "Period 5", False),
    (7, time(14, 0), time(14, 50), "Period 6", False),
    (8, time(14, 50), time(15, 40), "Period 7", False),
]


async def ensure_period_grid(db: AsyncSession, school_id: UUID) -> dict[int, SchoolPeriod]:
    """Idempotently install the default period grid for a school. Returns a
    {period_number: SchoolPeriod} map for downstream lookups."""
    existing = (
        await db.execute(
            select(SchoolPeriod).where(SchoolPeriod.school_id == school_id)
        )
    ).scalars().all()
    by_num = {p.period_number: p for p in existing}
    for n, start, end, label, is_break in DEFAULT_PERIOD_GRID:
        if n in by_num:
            continue
        p = SchoolPeriod(
            school_id=school_id,
            period_number=n,
            start_time=start,
            end_time=end,
            label=label,
            is_break=is_break,
        )
        db.add(p)
        by_num[n] = p
    await db.flush()
    return by_num


async def set_section_room(
    db: AsyncSession, section_id: UUID, room: str
) -> None:
    """Stamp the section's default classroom (where students sit)."""
    sec = (await db.execute(select(Section).where(Section.id == section_id))).scalar_one()
    if sec.room != room:
        sec.room = room
        await db.flush()


async def wipe_section_schedules(db: AsyncSession, section_id: UUID) -> None:
    """Remove all class_schedule rows for assignments in this section.

    Used at the start of the timetable build so re-running the seed produces a
    clean grid even if older runs left ad-hoc rows (with gaps, without period
    numbers, etc.). Safe because attendance_sessions reference assignments,
    not schedules — sessions survive even when their schedule row is rewritten.
    """
    rows = (
        await db.execute(
            select(ClassSchedule)
            .join(SubjectAssignment, ClassSchedule.subject_assignment_id == SubjectAssignment.id)
            .where(SubjectAssignment.section_id == section_id)
        )
    ).scalars().all()
    for r in rows:
        await db.delete(r)
    await db.flush()


async def add_period_schedule(
    db: AsyncSession,
    assignment_id: UUID,
    day_of_week: int,
    period_number: int,
    grid: dict[int, SchoolPeriod],
    duration_periods: int = 1,
    room_override: str | None = None,
) -> None:
    """Insert a class_schedule row using the school period grid.

    `start_time`/`end_time` are denormalised from the grid so existing
    queries (which read times directly) keep working unchanged. For multi-
    period blocks (labs, default duration=2), end_time comes from the last
    period in the span.
    """
    start_period = grid.get(period_number)
    end_period = grid.get(period_number + duration_periods - 1)
    if not start_period or not end_period:
        raise ValueError(
            f"period {period_number} (+{duration_periods - 1}) not in grid"
        )
    if start_period.is_break or end_period.is_break:
        raise ValueError(
            f"period {period_number} or its span overlaps a break"
        )

    db.add(
        ClassSchedule(
            subject_assignment_id=assignment_id,
            day_of_week=day_of_week,
            period_number=period_number,
            duration_periods=duration_periods,
            start_time=start_period.start_time,
            end_time=end_period.end_time,
            room=room_override,
        )
    )
    await db.flush()


# ─── Main seeder ────────────────────────────────────────


SAMPLE_FIRST_NAMES = [
    "Aarav", "Diya", "Arjun", "Pranav", "Mohit", "Saira", "Kavya", "Anushka",
    "Vihaan", "Ishaan", "Riya", "Tara", "Aditya", "Meera", "Rohan", "Aanya",
    "Krishna", "Dev", "Anaya", "Vivaan", "Aisha", "Reyansh", "Myra", "Aryan",
    "Saanvi", "Ayaan", "Sara", "Atharva", "Aadhya", "Kabir",
]
SAMPLE_LAST_NAMES = [
    "Sharma", "Patel", "Joshi", "Rao", "Pillai", "Nair", "Iyer", "Bhatt",
    "Menon", "Khanna", "Shetty", "Reddy", "Verma", "Kumar", "Singh", "Mehta",
    "Kapoor", "Gupta", "Shah", "Desai",
]


async def seed_demo() -> None:
    async with AsyncSessionLocal() as db:
        # Look up existing schools/departments from base seed
        eng = (await db.execute(select(School).where(School.code == "ENG"))).scalar_one_or_none()
        med = (await db.execute(select(School).where(School.code == "MED"))).scalar_one_or_none()
        if not eng or not med:
            print("✗ Base data missing. Run `make seed` first.")
            return

        cs_dept = (
            await db.execute(
                select(Department).where(Department.code == "ENG-01")
            )
        ).scalar_one()
        ee_dept = (
            await db.execute(
                select(Department).where(Department.code == "ENG-02")
            )
        ).scalar_one()

        # ── Management roles ───────────────────────
        print("→ Creating management role users")
        await upsert_user_with_role(db, "registrar@takshashila.edu", "Reena Rao", "registrar")
        await upsert_user_with_role(db, "vc@takshashila.edu", "Dr. V.K. Menon", "vc")
        await upsert_user_with_role(
            db, "chancellor@takshashila.edu", "Sri Vivek Sharma", "chancellor"
        )
        await upsert_user_with_role(
            db, "dean.eng@takshashila.edu", "Dr. Priya Krishnan", "dean",
            scope_type="school", scope_id=eng.id,
        )
        await upsert_user_with_role(
            db, "dean.med@takshashila.edu", "Dr. Rahul Bhatt", "dean",
            scope_type="school", scope_id=med.id,
        )
        await upsert_user_with_role(
            db, "hod.cs@takshashila.edu", "Dr. Suresh Kumar", "hod",
            scope_type="department", scope_id=cs_dept.id,
        )
        await upsert_user_with_role(
            db, "hod.ee@takshashila.edu", "Dr. Lakshmi Iyer", "hod",
            scope_type="department", scope_id=ee_dept.id,
        )

        await db.commit()

        # ── Faculty (with logins) ──────────────────
        print("→ Creating faculty with logins")
        # CS faculty (3 — match the names from base seed.py)
        cs_fac_1 = await upsert_faculty_with_login(
            db, "anitha.r@takshashila.edu", "Dr. Anitha Raghavan",
            "FAC-ENG-118", cs_dept.id,
        )
        cs_fac_2 = await upsert_faculty_with_login(
            db, "vikram.i@takshashila.edu", "Prof. Vikram Iyer",
            "FAC-ENG-202", cs_dept.id,
        )
        cs_fac_3 = await upsert_faculty_with_login(
            db, "meera.s@takshashila.edu", "Dr. Meera Subramanian",
            "FAC-ENG-145", cs_dept.id,
        )
        # ECE faculty (2 — new)
        ee_fac_1 = await upsert_faculty_with_login(
            db, "kavya.n@takshashila.edu", "Dr. Kavya Nair",
            "FAC-ENG-301", ee_dept.id,
        )
        ee_fac_2 = await upsert_faculty_with_login(
            db, "arjun.b@takshashila.edu", "Dr. Arjun Bhatt",
            "FAC-ENG-302", ee_dept.id,
        )

        await db.commit()

        # ── Programs and sections ──────────────────
        print("→ Creating programs and sections")
        btech_cse = await get_or_create_program(
            db, "BTECH-CSE", "B.Tech Computer Science", cs_dept.id, 4
        )
        btech_ece = await get_or_create_program(
            db, "BTECH-ECE", "B.Tech Electronics", ee_dept.id, 4
        )

        cs_y1a = await get_or_create_section(db, btech_cse, 1, "A")
        cs_y2a = await get_or_create_section(db, btech_cse, 2, "A")
        cs_y3a = await get_or_create_section(db, btech_cse, 3, "A")
        ec_y1a = await get_or_create_section(db, btech_ece, 1, "A")

        await db.commit()

        # ── CIC ────────────────────────────────────
        print("→ Creating Class-in-Charge")
        await upsert_user_with_role(
            db, "cic.cs.y3a@takshashila.edu", "Dr. Anand Verma", "cic",
            scope_type="section", scope_id=cs_y3a,
        )
        # Also put the user_id on the section's cic_user_id
        cic_user = (
            await db.execute(
                select(User).where(User.email == "cic.cs.y3a@takshashila.edu")
            )
        ).scalar_one()
        sec = (await db.execute(select(Section).where(Section.id == cs_y3a))).scalar_one()
        sec.cic_user_id = cic_user.id
        await db.commit()

        # ── Curriculum (subjects + faculty assignments) ───
        # Driven by config below so each section gets a realistic full
        # curriculum (4–5 theory subjects + 1–2 labs) instead of a token
        # 2-subject placeholder. The dispatch logic later iterates this
        # config to create subjects → assignments → schedules. Idempotent.

        faculty_map = {
            "anitha": cs_fac_1,
            "vikram": cs_fac_2,
            "meera": cs_fac_3,
            "kavya": ee_fac_1,
            "arjun": ee_fac_2,
        }
        sections_map = {
            "cs_y1a": (cs_y1a, cs_dept.id),
            "cs_y2a": (cs_y2a, cs_dept.id),
            "cs_y3a": (cs_y3a, cs_dept.id),
            "ec_y1a": (ec_y1a, ee_dept.id),
        }

        # SUBJECTS: code → (name, credits, type, dept_id). Theory/lab labelling
        # drives the UI's pill colour and groups the timetable visually.
        subject_catalog: dict[str, tuple[str, int, str, UUID]] = {
            # CS first-year foundations (shared across CSE Y1)
            "CS-101": ("Intro to Programming", 4, "theory", cs_dept.id),
            "CS-110": ("Discrete Mathematics", 3, "theory", cs_dept.id),
            "CS-120": ("Engineering Physics", 3, "theory", cs_dept.id),
            "CS-130": ("Communication Skills", 2, "theory", cs_dept.id),
            "CS-150": ("Programming Lab", 2, "lab", cs_dept.id),
            # CS second-year core
            "CS-201": ("Data Structures & Algorithms", 4, "theory", cs_dept.id),
            "CS-210": ("Computer Organization", 4, "theory", cs_dept.id),
            "CS-220": ("Data Structures Lab", 2, "lab", cs_dept.id),
            "CS-230": ("Database Systems", 3, "theory", cs_dept.id),
            "CS-240": ("Operating Systems", 4, "theory", cs_dept.id),
            "CS-260": ("DBMS Lab", 2, "lab", cs_dept.id),
            # CS third-year specialization
            "CS-301": ("Distributed Systems", 4, "theory", cs_dept.id),
            "CS-310": ("Computer Networks", 4, "theory", cs_dept.id),
            "CS-320": ("Software Engineering", 3, "theory", cs_dept.id),
            "CS-330": ("Networks Lab", 2, "lab", cs_dept.id),
            "CS-410": ("Compiler Design", 4, "theory", cs_dept.id),
            # ECE first-year
            "EC-101": ("Circuit Theory", 4, "theory", ee_dept.id),
            "EC-110": ("Digital Logic Design", 3, "theory", ee_dept.id),
            "EC-120": ("Engineering Mathematics", 3, "theory", ee_dept.id),
            "EC-130": ("C Programming", 3, "theory", ee_dept.id),
            "EC-150": ("Electronics Lab", 2, "lab", ee_dept.id),
            "EC-160": ("Digital Lab", 2, "lab", ee_dept.id),
        }

        # CURRICULUM: section_key → list of (subject_code, faculty_key).
        # Defines who teaches what. Faculty are reused across sections to
        # match real life — a senior lecturer teaches a course to multiple
        # batches.
        curriculum: dict[str, list[tuple[str, str]]] = {
            "cs_y1a": [
                ("CS-101", "anitha"),
                ("CS-110", "vikram"),
                ("CS-120", "meera"),
                ("CS-130", "anitha"),
                ("CS-150", "anitha"),  # programming lab
            ],
            "cs_y2a": [
                ("CS-201", "vikram"),
                ("CS-210", "meera"),
                ("CS-230", "anitha"),
                ("CS-240", "vikram"),
                ("CS-220", "meera"),  # DSA lab
                ("CS-260", "anitha"),  # DBMS lab
            ],
            "cs_y3a": [
                ("CS-301", "anitha"),
                ("CS-310", "vikram"),
                ("CS-320", "meera"),
                ("CS-410", "meera"),
                ("CS-330", "vikram"),  # networks lab
            ],
            "ec_y1a": [
                ("EC-101", "kavya"),
                ("EC-110", "arjun"),
                ("EC-120", "kavya"),
                ("EC-130", "arjun"),
                ("EC-150", "kavya"),  # electronics lab
                ("EC-160", "arjun"),  # digital lab
            ],
        }

        # SECTION CLASSROOMS: each section sits in a fixed room. Faculty
        # rotate through these rooms — students stay put. Labs are the only
        # rooms a section actually leaves their classroom for.
        section_rooms: dict[str, str] = {
            "cs_y1a": "E-101",
            "cs_y2a": "E-202",
            "cs_y3a": "E-204",
            "ec_y1a": "E-301",
        }

        # TIMETABLES: section_key → list of (dow, period_number, code,
        # duration_periods, room_override_or_None).
        #
        # Periods reference the school's master grid (back-to-back, no gaps,
        # lunch is period 5 — schedules skip it). Theory classes are 1-period
        # blocks in the section's own classroom (room_override=None means
        # "use section.room"). Labs are 2-period afternoon blocks in a lab
        # room, so they explicitly override.
        #
        # Day numbering is Python weekday(): 0=Mon … 4=Fri.
        timetables: dict[str, list[tuple[int, int, str, int, str | None]]] = {
            "cs_y1a": [
                # Mon: 4 morning periods (P1–P4)
                (0, 1, "CS-101", 1, None),
                (0, 2, "CS-110", 1, None),
                (0, 3, "CS-120", 1, None),
                (0, 4, "CS-130", 1, None),
                # Tue: 3 morning + 2-period lab in the afternoon (P6+P7)
                (1, 1, "CS-130", 1, None),
                (1, 2, "CS-101", 1, None),
                (1, 3, "CS-110", 1, None),
                (1, 6, "CS-150", 2, "E-Lab1"),
                # Wed: full morning
                (2, 1, "CS-110", 1, None),
                (2, 2, "CS-120", 1, None),
                (2, 3, "CS-130", 1, None),
                (2, 4, "CS-101", 1, None),
                # Thu
                (3, 1, "CS-101", 1, None),
                (3, 2, "CS-110", 1, None),
                (3, 3, "CS-120", 1, None),
                (3, 4, "CS-130", 1, None),
                # Fri
                (4, 1, "CS-130", 1, None),
                (4, 2, "CS-101", 1, None),
                (4, 3, "CS-110", 1, None),
            ],
            "cs_y2a": [
                # Mon
                (0, 1, "CS-201", 1, None),
                (0, 2, "CS-210", 1, None),
                (0, 3, "CS-230", 1, None),
                (0, 4, "CS-240", 1, None),
                # Tue: morning + DSA lab afternoon
                (1, 1, "CS-240", 1, None),
                (1, 2, "CS-230", 1, None),
                (1, 3, "CS-210", 1, None),
                (1, 6, "CS-220", 2, "E-Lab2"),
                # Wed
                (2, 1, "CS-201", 1, None),
                (2, 2, "CS-210", 1, None),
                (2, 3, "CS-240", 1, None),
                (2, 4, "CS-230", 1, None),
                # Thu: morning + DBMS lab afternoon
                (3, 1, "CS-230", 1, None),
                (3, 2, "CS-201", 1, None),
                (3, 3, "CS-240", 1, None),
                (3, 6, "CS-260", 2, "E-Lab1"),
                # Fri
                (4, 1, "CS-210", 1, None),
                (4, 2, "CS-240", 1, None),
                (4, 3, "CS-230", 1, None),
                (4, 4, "CS-201", 1, None),
            ],
            "cs_y3a": [
                # Mon
                (0, 1, "CS-301", 1, None),
                (0, 2, "CS-310", 1, None),
                (0, 3, "CS-320", 1, None),
                (0, 4, "CS-410", 1, None),
                # Tue: morning + Networks Lab
                (1, 1, "CS-410", 1, None),
                (1, 2, "CS-301", 1, None),
                (1, 3, "CS-320", 1, None),
                (1, 6, "CS-330", 2, "E-Lab3"),
                # Wed
                (2, 1, "CS-301", 1, None),
                (2, 2, "CS-310", 1, None),
                (2, 3, "CS-320", 1, None),
                (2, 4, "CS-410", 1, None),
                # Thu
                (3, 1, "CS-410", 1, None),
                (3, 2, "CS-301", 1, None),
                (3, 3, "CS-310", 1, None),
                (3, 4, "CS-320", 1, None),
                # Fri
                (4, 1, "CS-310", 1, None),
                (4, 2, "CS-320", 1, None),
                (4, 3, "CS-410", 1, None),
            ],
            "ec_y1a": [
                # Mon
                (0, 1, "EC-101", 1, None),
                (0, 2, "EC-110", 1, None),
                (0, 3, "EC-120", 1, None),
                (0, 4, "EC-130", 1, None),
                # Tue: morning + electronics lab
                (1, 1, "EC-130", 1, None),
                (1, 2, "EC-101", 1, None),
                (1, 3, "EC-110", 1, None),
                (1, 6, "EC-150", 2, "E-Lab4"),
                # Wed
                (2, 1, "EC-101", 1, None),
                (2, 2, "EC-110", 1, None),
                (2, 3, "EC-120", 1, None),
                (2, 4, "EC-130", 1, None),
                # Thu: morning + digital lab
                (3, 1, "EC-130", 1, None),
                (3, 2, "EC-120", 1, None),
                (3, 3, "EC-101", 1, None),
                (3, 6, "EC-160", 2, "E-Lab5"),
                # Fri
                (4, 1, "EC-101", 1, None),
                (4, 2, "EC-110", 1, None),
                (4, 3, "EC-120", 1, None),
                (4, 4, "EC-130", 1, None),
            ],
        }

        # ── Materialise: school period grid ─────────
        # ENG school owns all four demo sections — install the standard
        # back-to-back grid (P1–P4 morning, P5 lunch, P6–P8 afternoon).
        print("→ Installing school period grid")
        eng_periods = await ensure_period_grid(db, eng.id)
        await db.commit()

        # ── Materialise: subjects ──────────────────
        print("→ Creating subjects (full curriculum)")
        subject_ids: dict[str, UUID] = {}
        for code, (name, credits, stype, dept_id) in subject_catalog.items():
            subject_ids[code] = await get_or_create_subject(
                db, code, name, dept_id, credits, stype
            )
        await db.commit()

        # ── Materialise: assignments (subject × faculty × section) ──
        print("→ Creating assignments")
        # (section_key, subject_code) → assignment_id, used later for schedule
        # creation and attendance history generation.
        assignments: dict[tuple[str, str], UUID] = {}
        for section_key, subjects in curriculum.items():
            section_id, _ = sections_map[section_key]
            for code, faculty_key in subjects:
                assignment_id = await get_or_create_assignment(
                    db, subject_ids[code], faculty_map[faculty_key], section_id
                )
                assignments[(section_key, code)] = assignment_id
        await db.commit()

        # ── Materialise: section rooms ─────────────
        # Stamp each section with its fixed classroom. Faculty rotate; the
        # students live here for theory classes.
        print("→ Setting section classrooms")
        for section_key, room in section_rooms.items():
            section_id, _ = sections_map[section_key]
            await set_section_room(db, section_id, room)
        await db.commit()

        # ── Materialise: weekly timetable ──────────
        # Wipe existing schedules first so re-running with a different shape
        # (e.g. swapping period times, adding a lab) produces a clean grid.
        # Attendance sessions point at assignments, not schedules, so this is
        # safe — historic attendance survives.
        print("→ Resetting and creating weekly timetables")
        for section_key in timetables:
            section_id, _ = sections_map[section_key]
            await wipe_section_schedules(db, section_id)
        await db.commit()

        for section_key, slots in timetables.items():
            for dow, period_number, code, duration, room_override in slots:
                assignment_id = assignments.get((section_key, code))
                if not assignment_id:
                    # Should not happen — curriculum + timetable are kept in
                    # sync above. Skip rather than crash so a partial mis-
                    # configuration doesn't block the whole seeder.
                    print(f"  ⚠ no assignment for {section_key}/{code}, skipping schedule")
                    continue
                await add_period_schedule(
                    db,
                    assignment_id,
                    dow,
                    period_number,
                    eng_periods,
                    duration_periods=duration,
                    room_override=room_override,
                )
        await db.commit()

        # ── Students ───────────────────────────────
        print("→ Creating students (10 per section)")

        def gen_name(seed: int) -> str:
            random.seed(seed)
            return f"{random.choice(SAMPLE_FIRST_NAMES)} {random.choice(SAMPLE_LAST_NAMES)}"

        student_ids: dict[UUID, list[UUID]] = {}  # section_id -> [student_id]

        sections_with_meta = [
            (cs_y1a, "ENG", 1, 2025, "cse"),
            (cs_y2a, "ENG", 2, 2024, "cse"),
            (cs_y3a, "ENG", 3, 2023, "cse"),
            (ec_y1a, "ENG", 1, 2025, "ece"),
        ]

        global_idx = 1
        for section_id, school_code, _year, admit_year, prog_short in sections_with_meta:
            ids = []
            for i in range(10):
                name = gen_name(global_idx * 7 + i)
                email = f"student{global_idx}@takshashila.edu"
                enrollment = f"{school_code}/{prog_short.upper()}/{admit_year}/{i:04d}"
                stu_id = await upsert_student_with_login(
                    db, email, name, enrollment, section_id, admit_year
                )
                ids.append(stu_id)
                global_idx += 1
            student_ids[section_id] = ids

        await db.commit()

        # ── Attendance history ─────────────────────
        # Build a lookup from each assignment back to its section so we can
        # populate sessions + records. Drives the dashboards.
        print("→ Generating attendance history")

        section_for_assignment: dict[UUID, UUID] = {
            assignment_id: sections_map[section_key][0]
            for (section_key, _code), assignment_id in assignments.items()
        }

        today = date.today()
        for assignment_id, section_id in section_for_assignment.items():
            ids = student_ids[section_id]
            # 4 closed sessions over the last 14 days. 4 * ~24 assignments *
            # ~10 students = ~960 records — keeps dashboards meaningful
            # without making the seeder painfully slow.
            for n in range(4):
                session_date = today - timedelta(days=2 + n * 2)
                # Skip if a session already exists for this date+assignment
                existing_session = (
                    await db.execute(
                        select(AttendanceSession).where(
                            and_(
                                AttendanceSession.subject_assignment_id == assignment_id,
                                AttendanceSession.session_date == session_date,
                            )
                        )
                    )
                ).scalars().first()
                if existing_session:
                    continue

                started_at = datetime.combine(
                    session_date, time(9, 0), tzinfo=UTC
                )
                session = AttendanceSession(
                    subject_assignment_id=assignment_id,
                    session_date=session_date,
                    started_at=started_at,
                    ended_at=started_at + timedelta(minutes=50),
                    qr_secret=generate_session_secret(),
                    status="closed",
                    faculty_lat=12.97160000,
                    faculty_lng=77.59460000,
                )
                db.add(session)
                await db.flush()

                # 92% present, 5% late, 3% absent
                random.seed(int(assignment_id.int) ^ n)
                for stu_id in ids:
                    r = random.random()
                    if r < 0.92:
                        status = "present"
                    elif r < 0.97:
                        status = "late"
                    else:
                        status = "absent"
                    db.add(
                        AttendanceRecord(
                            session_id=session.id,
                            student_id=stu_id,
                            status=status,
                            marked_by="qr_scan",
                            marked_at=started_at + timedelta(minutes=2),
                        )
                    )

        await db.commit()
        print("→ Done")

        print("\n" + "=" * 60)
        print("Demo logins (all password: Demo@123)")
        print("=" * 60)
        for label, email in [
            ("Registrar", "registrar@takshashila.edu"),
            ("Vice-Chancellor", "vc@takshashila.edu"),
            ("Chancellor", "chancellor@takshashila.edu"),
            ("Dean (ENG)", "dean.eng@takshashila.edu"),
            ("Dean (MED)", "dean.med@takshashila.edu"),
            ("HOD (CS)", "hod.cs@takshashila.edu"),
            ("HOD (ECE)", "hod.ee@takshashila.edu"),
            ("CIC (CS Y3A)", "cic.cs.y3a@takshashila.edu"),
            ("Faculty (CS)", "anitha.r@takshashila.edu"),
            ("Faculty (CS)", "vikram.i@takshashila.edu"),
            ("Faculty (CS)", "meera.s@takshashila.edu"),
            ("Faculty (ECE)", "kavya.n@takshashila.edu"),
            ("Faculty (ECE)", "arjun.b@takshashila.edu"),
            ("Student (any)", "student1@takshashila.edu"),
        ]:
            print(f"  {label:20} {email}")
        print("\n  40 students total: student1@ … student40@takshashila.edu")
        print("  4 sections seeded: BTECH-CSE Y1A, Y2A, Y3A + BTECH-ECE Y1A")


if __name__ == "__main__":
    asyncio.run(seed_demo())
