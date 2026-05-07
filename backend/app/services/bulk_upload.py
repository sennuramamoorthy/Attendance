"""Bulk upload handlers for each admin entity type.

Each handler receives parsed CSV rows + a DB session and returns
a list of row-level errors. The dispatcher in app/api/admin.py wraps
this with success counting and commit.

CSVs use human-friendly identifiers (codes, emails) so admins can fill
them in by hand. Lookups happen here.
"""

from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.user import FacultyMember, Student, User, UserRole

Handler = Callable[[list[dict[str, str]], AsyncSession], Awaitable[tuple[int, list[str]]]]


# ─── Templates ───────────────────────────────────────────

TEMPLATES: dict[str, list[list[str]]] = {
    "schools": [
        ["name", "code", "term_type", "min_attendance_pct"],
        ["Engineering & Technology", "ENG", "semester", "75"],
        ["Medical Science", "MED", "yearly", "85"],
    ],
    "departments": [
        ["school_code", "name", "code"],
        ["ENG", "Computer Science", "ENG-01"],
        ["ENG", "Electronics", "ENG-02"],
    ],
    "programs": [
        ["department_code", "name", "code", "duration_years"],
        ["ENG-01", "B.Tech Computer Science", "BTECH-CSE", "4"],
    ],
    "sections": [
        ["program_code", "year", "division"],
        ["BTECH-CSE", "1", "A"],
        ["BTECH-CSE", "1", "B"],
    ],
    "faculty": [
        ["email", "full_name", "employee_id", "department_code", "phone"],
        ["anitha.r@takshashila.edu", "Dr. Anitha Raghavan", "FAC-ENG-118", "ENG-01", ""],
    ],
    "subjects": [
        ["code", "name", "department_code", "credits", "type"],
        ["CS-301", "Distributed Systems", "ENG-01", "4", "theory"],
        ["CS-220", "Data Structures Lab", "ENG-01", "2", "lab"],
    ],
    "students": [
        ["email", "full_name", "enrollment_no", "program_code", "year", "division", "admitted_year", "phone"],
        ["aarav.s@takshashila.edu", "Aarav Sharma", "ENG/2023/0421", "BTECH-CSE", "3", "A", "2023", ""],
    ],
    "assignments": [
        ["subject_code", "faculty_employee_id", "program_code", "year", "division", "academic_year", "term"],
        ["CS-301", "FAC-ENG-118", "BTECH-CSE", "3", "A", "2025", "1"],
    ],
    # Weekly timetable. Each row puts one subject in one period of one day for
    # a section. `room_override` is blank for normal classes (resolves to the
    # section's classroom) and set to a lab block (e.g. E-Lab3) for labs.
    "timetable": [
        [
            "program_code", "year", "division",
            "day", "period_number", "subject_code",
            "duration_periods", "room_override",
        ],
        ["BTECH-CSE", "3", "A", "Mon", "1", "CS-301", "1", ""],
        ["BTECH-CSE", "3", "A", "Mon", "2", "CS-310", "1", ""],
        ["BTECH-CSE", "3", "A", "Tue", "6", "CS-330", "2", "E-Lab3"],
    ],
}


def render_csv(rows: list[list[str]]) -> str:
    """CSV-encode header + sample rows. Quotes anything containing comma or quote."""
    import csv
    from io import StringIO

    buf = StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


# ─── Lookup helpers ──────────────────────────────────────


async def _school_id(db: AsyncSession, code: str) -> UUID:
    school = (await db.execute(select(School).where(School.code == code))).scalar_one_or_none()
    if not school:
        raise ValueError(f"school code '{code}' not found")
    return school.id


async def _department_id(db: AsyncSession, code: str) -> UUID:
    dept = (
        await db.execute(select(Department).where(Department.code == code))
    ).scalar_one_or_none()
    if not dept:
        raise ValueError(f"department code '{code}' not found")
    return dept.id


async def _program_id(db: AsyncSession, code: str) -> UUID:
    prog = (
        await db.execute(select(Program).where(Program.code == code))
    ).scalar_one_or_none()
    if not prog:
        raise ValueError(f"program code '{code}' not found")
    return prog.id


async def _section_id(db: AsyncSession, program_code: str, year: int, division: str) -> UUID:
    pid = await _program_id(db, program_code)
    sec = (
        await db.execute(
            select(Section).where(
                Section.program_id == pid,
                Section.year == year,
                Section.division == division,
            )
        )
    ).scalar_one_or_none()
    if not sec:
        raise ValueError(f"section {program_code}/Y{year}/{division} not found")
    return sec.id


async def _faculty_id_by_employee(db: AsyncSession, employee_id: str) -> UUID:
    fac = (
        await db.execute(
            select(FacultyMember).where(FacultyMember.employee_id == employee_id)
        )
    ).scalar_one_or_none()
    if not fac:
        raise ValueError(f"faculty employee_id '{employee_id}' not found")
    return fac.id


async def _subject_id(db: AsyncSession, code: str) -> UUID:
    subj = (
        await db.execute(select(Subject).where(Subject.code == code))
    ).scalar_one_or_none()
    if not subj:
        raise ValueError(f"subject code '{code}' not found")
    return subj.id


# ─── Per-entity handlers ─────────────────────────────────


async def upload_schools(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            db.add(
                School(
                    name=row["name"],
                    code=row["code"],
                    term_type=row.get("term_type", "semester"),
                    min_attendance_pct=int(row.get("min_attendance_pct") or 75),
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_departments(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            school_id = await _school_id(db, row["school_code"])
            db.add(Department(school_id=school_id, name=row["name"], code=row["code"]))
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_programs(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            dept_id = await _department_id(db, row["department_code"])
            db.add(
                Program(
                    department_id=dept_id,
                    name=row["name"],
                    code=row["code"],
                    duration_years=int(row.get("duration_years") or 4),
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_sections(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            prog_id = await _program_id(db, row["program_code"])
            db.add(
                Section(
                    program_id=prog_id,
                    year=int(row["year"]),
                    division=row.get("division") or "A",
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_faculty(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            dept_id = await _department_id(db, row["department_code"])
            user_id = uuid4()
            db.add(
                User(
                    id=user_id,
                    email=row["email"],
                    full_name=row["full_name"],
                    phone=row.get("phone") or None,
                )
            )
            await db.flush()
            db.add(
                FacultyMember(
                    user_id=user_id, employee_id=row["employee_id"], department_id=dept_id
                )
            )
            db.add(
                UserRole(
                    user_id=user_id,
                    role="faculty",
                    scope_type="department",
                    scope_id=dept_id,
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_subjects(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            dept_id = await _department_id(db, row["department_code"])
            db.add(
                Subject(
                    code=row["code"],
                    name=row["name"],
                    department_id=dept_id,
                    credits=int(row.get("credits") or 3),
                    type=row.get("type") or "theory",
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_students(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            section_id = await _section_id(
                db, row["program_code"], int(row["year"]), row.get("division") or "A"
            )
            user_id = uuid4()
            db.add(
                User(
                    id=user_id,
                    email=row["email"],
                    full_name=row["full_name"],
                    phone=row.get("phone") or None,
                )
            )
            await db.flush()
            db.add(
                Student(
                    user_id=user_id,
                    enrollment_no=row["enrollment_no"],
                    section_id=section_id,
                    admitted_year=int(row.get("admitted_year") or 2025),
                )
            )
            db.add(
                UserRole(
                    user_id=user_id,
                    role="student",
                    scope_type="section",
                    scope_id=section_id,
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


async def upload_assignments(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    success, errors = 0, []
    for i, row in enumerate(rows):
        try:
            subject_id = await _subject_id(db, row["subject_code"])
            faculty_id = await _faculty_id_by_employee(db, row["faculty_employee_id"])
            section_id = await _section_id(
                db, row["program_code"], int(row["year"]), row.get("division") or "A"
            )
            db.add(
                SubjectAssignment(
                    subject_id=subject_id,
                    faculty_id=faculty_id,
                    section_id=section_id,
                    academic_year=int(row.get("academic_year") or 2025),
                    term=int(row.get("term") or 1),
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


# ─── Timetable upload ────────────────────────────────────

# Day name → Python weekday() integer. Accept both common short forms and
# the full integer so admins can fill the column either way.
_DAY_LOOKUP: dict[str, int] = {
    "mon": 0, "monday": 0, "0": 0,
    "tue": 1, "tues": 1, "tuesday": 1, "1": 1,
    "wed": 2, "weds": 2, "wednesday": 2, "2": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "3": 3,
    "fri": 4, "friday": 4, "4": 4,
    "sat": 5, "saturday": 5, "5": 5,
    "sun": 6, "sunday": 6, "6": 6,
}


def _parse_day(raw: str) -> int:
    key = (raw or "").strip().lower()
    if key not in _DAY_LOOKUP:
        raise ValueError(
            f"day '{raw}' not recognised — use Mon/Tue/.../Sun or 0–6"
        )
    return _DAY_LOOKUP[key]


async def _school_for_section(db: AsyncSession, section_id: UUID) -> UUID:
    """Walk section → program → department → school to find the school owning
    the period grid."""
    row = (
        await db.execute(
            select(School.id)
            .join(Department, Department.school_id == School.id)
            .join(Program, Program.department_id == Department.id)
            .join(Section, Section.program_id == Program.id)
            .where(Section.id == section_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise ValueError(f"can't resolve school for section {section_id}")
    return row


async def upload_timetable(
    rows: list[dict[str, str]], db: AsyncSession
) -> tuple[int, list[str]]:
    """Insert class_schedule rows from the timetable CSV.

    Each row binds (section, subject, day, period). Validation:
      - section + subject must exist
      - subject must already be assigned to the section (an assignment row
        in subject_assignments — that's where faculty comes from)
      - period_number + duration_periods must fit inside the school's grid
        and not cross a break row (e.g. lunch)
      - no duplicate (section, day, period) — admins should remove the old
        row from the section detail page before re-uploading
    """
    success, errors = 0, []
    # Cache the period grid per school across rows — most uploads stay within
    # one school, so this avoids re-querying for every row.
    period_grid_cache: dict[UUID, dict[int, SchoolPeriod]] = {}

    for i, row in enumerate(rows):
        try:
            section_id = await _section_id(
                db, row["program_code"], int(row["year"]), row.get("division") or "A"
            )
            subject_id = await _subject_id(db, row["subject_code"])

            # The subject must already be assigned to this section — that
            # binds the faculty member who teaches it. Use `first()` rather
            # than `scalar_one_or_none()` so historical duplicate assignments
            # (e.g. from a base seed + demo seed both inserting) don't break
            # the upload — we just pick the first one.
            assignment = (
                await db.execute(
                    select(SubjectAssignment).where(
                        SubjectAssignment.subject_id == subject_id,
                        SubjectAssignment.section_id == section_id,
                    )
                )
            ).scalars().first()
            if not assignment:
                raise ValueError(
                    f"subject '{row['subject_code']}' is not assigned to "
                    f"{row['program_code']}/Y{row['year']}/{row.get('division') or 'A'}"
                    " — add an assignment first"
                )

            day_of_week = _parse_day(row["day"])
            period_number = int(row["period_number"])
            duration = int(row.get("duration_periods") or 1)
            if duration < 1:
                raise ValueError("duration_periods must be >= 1")
            room_override = (row.get("room_override") or "").strip() or None

            # Pull the school's period grid (cached).
            school_id = await _school_for_section(db, section_id)
            grid = period_grid_cache.get(school_id)
            if grid is None:
                grid_rows = (
                    await db.execute(
                        select(SchoolPeriod).where(
                            SchoolPeriod.school_id == school_id
                        )
                    )
                ).scalars().all()
                grid = {p.period_number: p for p in grid_rows}
                period_grid_cache[school_id] = grid

            start_period = grid.get(period_number)
            end_period = grid.get(period_number + duration - 1)
            if not start_period:
                raise ValueError(
                    f"period {period_number} not in the school's grid"
                )
            if not end_period:
                raise ValueError(
                    f"period {period_number}+{duration - 1} extends past the grid"
                )
            if start_period.is_break or end_period.is_break:
                raise ValueError(
                    f"period {period_number} (or its span) overlaps a break "
                    f"({start_period.label or 'break'})"
                )

            # Reject duplicates so admin gets a clear "this slot is already
            # taken" error rather than a silent constraint violation.
            existing = (
                await db.execute(
                    select(ClassSchedule).where(
                        ClassSchedule.subject_assignment_id == assignment.id,
                        ClassSchedule.day_of_week == day_of_week,
                        ClassSchedule.period_number == period_number,
                    )
                )
            ).scalars().first()
            if existing:
                raise ValueError(
                    f"a schedule already exists for "
                    f"{row['program_code']}/Y{row['year']}/{row.get('division') or 'A'} "
                    f"on day {row['day']} period {period_number}"
                )

            db.add(
                ClassSchedule(
                    subject_assignment_id=assignment.id,
                    day_of_week=day_of_week,
                    period_number=period_number,
                    duration_periods=duration,
                    start_time=start_period.start_time,
                    end_time=end_period.end_time,
                    room=room_override,
                )
            )
            await db.flush()
            success += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")
            await db.rollback()
    return success, errors


# ─── Dispatch table ─────────────────────────────────────


HANDLERS: dict[str, Handler] = {
    "schools": upload_schools,
    "departments": upload_departments,
    "programs": upload_programs,
    "sections": upload_sections,
    "faculty": upload_faculty,
    "subjects": upload_subjects,
    "students": upload_students,
    "assignments": upload_assignments,
    "timetable": upload_timetable,
}
