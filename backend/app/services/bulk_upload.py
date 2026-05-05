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
    Department,
    Program,
    School,
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
}
