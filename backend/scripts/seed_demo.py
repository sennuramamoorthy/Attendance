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

        # ── Subjects ───────────────────────────────
        print("→ Creating subjects")
        cs_subjects = [
            (await get_or_create_subject(db, "CS-101", "Intro to Programming", cs_dept.id, 4)),
            (await get_or_create_subject(db, "CS-201", "Data Structures", cs_dept.id, 4)),
            (await get_or_create_subject(db, "CS-220", "Data Structures Lab", cs_dept.id, 2, "lab")),
            (await get_or_create_subject(db, "CS-301", "Distributed Systems", cs_dept.id, 4)),
            (await get_or_create_subject(db, "CS-410", "Compiler Design", cs_dept.id, 4)),
        ]
        ec_subjects = [
            (await get_or_create_subject(db, "EC-101", "Circuit Theory", ee_dept.id, 4)),
            (await get_or_create_subject(db, "EC-110", "Digital Logic", ee_dept.id, 3)),
        ]

        await db.commit()

        # ── Assignments + Schedules ────────────────
        print("→ Creating assignments and schedules")

        # CS Y1A: CS-101 by cs_fac_1 (Anitha), CS-201 by cs_fac_2 (Vikram)
        a_y1_101 = await get_or_create_assignment(db, cs_subjects[0], cs_fac_1, cs_y1a)
        a_y1_201 = await get_or_create_assignment(db, cs_subjects[1], cs_fac_2, cs_y1a)
        # CS Y2A: CS-201 by Vikram, CS-220 lab by Meera
        a_y2_201 = await get_or_create_assignment(db, cs_subjects[1], cs_fac_2, cs_y2a)
        a_y2_220 = await get_or_create_assignment(db, cs_subjects[2], cs_fac_3, cs_y2a)
        # CS Y3A: CS-301 by Anitha, CS-410 by Meera
        a_y3_301 = await get_or_create_assignment(db, cs_subjects[3], cs_fac_1, cs_y3a)
        a_y3_410 = await get_or_create_assignment(db, cs_subjects[4], cs_fac_3, cs_y3a)
        # ECE Y1A: EC-101 by Kavya, EC-110 by Arjun
        a_ec_101 = await get_or_create_assignment(db, ec_subjects[0], ee_fac_1, ec_y1a)
        a_ec_110 = await get_or_create_assignment(db, ec_subjects[1], ee_fac_2, ec_y1a)

        await db.commit()

        schedules = [
            (a_y1_101, 0, time(9, 0), time(9, 50), "E-101"),
            (a_y1_201, 1, time(10, 0), time(10, 50), "E-101"),
            (a_y2_201, 0, time(11, 0), time(11, 50), "E-202"),
            (a_y2_220, 2, time(14, 0), time(15, 40), "E-Lab3"),
            (a_y3_301, 0, time(9, 0), time(9, 50), "E-204"),
            (a_y3_410, 3, time(10, 0), time(10, 50), "E-205"),
            (a_ec_101, 0, time(9, 0), time(9, 50), "E-301"),
            (a_ec_110, 1, time(11, 0), time(11, 50), "E-301"),
        ]
        for assignment_id, dow, start, end, room in schedules:
            await get_or_create_schedule(db, assignment_id, dow, start, end, room)
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
        print("→ Generating attendance history")

        section_for_assignment = {
            a_y1_101: cs_y1a, a_y1_201: cs_y1a,
            a_y2_201: cs_y2a, a_y2_220: cs_y2a,
            a_y3_301: cs_y3a, a_y3_410: cs_y3a,
            a_ec_101: ec_y1a, a_ec_110: ec_y1a,
        }

        today = date.today()
        for assignment_id, section_id in section_for_assignment.items():
            ids = student_ids[section_id]
            # 5 closed sessions over the last 14 days
            for n in range(5):
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
