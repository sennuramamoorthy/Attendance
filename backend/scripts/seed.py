"""Seed initial schools, departments, terms, plus sample programs/sections/subjects/faculty/schedules."""

import asyncio
from datetime import date, time
from uuid import uuid4

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.academic import (
    AcademicTerm,
    ClassSchedule,
    Department,
    Program,
    School,
    Section,
    Subject,
    SubjectAssignment,
)
from app.models.user import FacultyMember, User, UserRole

SCHOOLS = [
    {"name": "Engineering & Technology", "code": "ENG", "term_type": "semester", "min_attendance_pct": 75},
    {"name": "Arts & Science", "code": "ART", "term_type": "semester", "min_attendance_pct": 75},
    {"name": "School of Business", "code": "BUS", "term_type": "semester", "min_attendance_pct": 80},
    {"name": "Hospital Science", "code": "HSP", "term_type": "yearly", "min_attendance_pct": 85},
    {"name": "Medical Science", "code": "MED", "term_type": "yearly", "min_attendance_pct": 85},
    {"name": "Human Resources & Science", "code": "HRS", "term_type": "semester", "min_attendance_pct": 75},
]

DEPARTMENTS = {
    "ENG": ["Computer Science", "Electronics", "Mechanical", "Civil", "Chemical"],
    "ART": ["English Literature", "History", "Physics", "Chemistry", "Mathematics"],
    "BUS": ["Finance", "Marketing", "Operations", "Human Resource Management"],
    "HSP": ["Nursing", "Clinical Lab", "Radiology", "Physiotherapy"],
    "MED": ["Anatomy", "Pharmacology", "Surgery", "Internal Medicine"],
    "HRS": ["Talent Management", "Organizational Behaviour", "Labour Law"],
}

# Sample faculty for ENG/Computer Science
SAMPLE_FACULTY = [
    {"name": "Dr. Anitha Raghavan", "email": "anitha.r@takshashila.edu", "employee_id": "FAC-ENG-118"},
    {"name": "Prof. Vikram Iyer", "email": "vikram.i@takshashila.edu", "employee_id": "FAC-ENG-202"},
    {"name": "Dr. Meera Subramanian", "email": "meera.s@takshashila.edu", "employee_id": "FAC-ENG-145"},
]

SAMPLE_SUBJECTS = [
    {"code": "CS-301", "name": "Distributed Systems", "credits": 4, "type": "theory"},
    {"code": "CS-220", "name": "Data Structures Lab", "credits": 2, "type": "lab"},
    {"code": "CS-410", "name": "Compiler Design", "credits": 4, "type": "theory"},
]

# (day_of_week, start, end, room) - day_of_week: 0=Mon
SAMPLE_SCHEDULES = [
    (0, time(9, 0), time(9, 50), "E-204"),
    (1, time(10, 0), time(11, 40), "E-Lab3"),
    (2, time(11, 50), time(12, 40), "E-118"),
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(School))).scalars().all()
        if existing:
            print(f"Database already has {len(existing)} schools — skipping seed")
            return

        # Schools
        for s in SCHOOLS:
            db.add(School(**s))
        await db.flush()

        schools_by_code = {s.code: s for s in (await db.execute(select(School))).scalars().all()}

        # Departments
        for code, dept_names in DEPARTMENTS.items():
            school = schools_by_code[code]
            for i, name in enumerate(dept_names, start=1):
                db.add(Department(school_id=school.id, name=name, code=f"{code}-{i:02d}"))
        await db.flush()

        # Academic terms
        for school in schools_by_code.values():
            term_name = (
                "Semester 1 2025-26" if school.term_type == "semester" else "Academic Year 2025-26"
            )
            end = date(2025, 11, 30) if school.term_type == "semester" else date(2026, 5, 31)
            db.add(
                AcademicTerm(
                    school_id=school.id,
                    name=term_name,
                    start_date=date(2025, 6, 1),
                    end_date=end,
                    is_active=True,
                )
            )

        # Sample data: ENG / Computer Science department
        cs_dept = (
            await db.execute(
                select(Department).where(
                    Department.school_id == schools_by_code["ENG"].id,
                    Department.name == "Computer Science",
                )
            )
        ).scalar_one()

        # Program
        program = Program(
            department_id=cs_dept.id,
            name="B.Tech Computer Science",
            code="BTECH-CSE",
            duration_years=4,
        )
        db.add(program)
        await db.flush()

        # Sections
        section_a = Section(program_id=program.id, year=3, division="A")
        db.add(section_a)
        await db.flush()

        # Faculty + roles (users must flush before referencing FKs)
        faculty_records = []
        for f in SAMPLE_FACULTY:
            user_id = uuid4()
            db.add(User(id=user_id, email=f["email"], full_name=f["name"]))
            await db.flush()
            faculty = FacultyMember(
                user_id=user_id, employee_id=f["employee_id"], department_id=cs_dept.id
            )
            db.add(faculty)
            db.add(
                UserRole(
                    user_id=user_id, role="faculty", scope_type="department", scope_id=cs_dept.id
                )
            )
            await db.flush()
            faculty_records.append(faculty)

        # Subjects + assignments + schedules
        for i, subj in enumerate(SAMPLE_SUBJECTS):
            subject = Subject(department_id=cs_dept.id, **subj)
            db.add(subject)
            await db.flush()

            assignment = SubjectAssignment(
                subject_id=subject.id,
                faculty_id=faculty_records[i].id,
                section_id=section_a.id,
                academic_year=2025,
                term=1,
            )
            db.add(assignment)
            await db.flush()

            day, start, end, room = SAMPLE_SCHEDULES[i]
            db.add(
                ClassSchedule(
                    subject_assignment_id=assignment.id,
                    day_of_week=day,
                    start_time=start,
                    end_time=end,
                    room=room,
                )
            )

        await db.commit()

        n_depts = sum(len(d) for d in DEPARTMENTS.values())
        print(
            f"Seeded {len(SCHOOLS)} schools, {n_depts} departments, "
            f"1 program, 1 section, {len(SAMPLE_FACULTY)} faculty, "
            f"{len(SAMPLE_SUBJECTS)} subjects + schedules"
        )


if __name__ == "__main__":
    asyncio.run(seed())
