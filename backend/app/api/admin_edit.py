"""PATCH and DELETE endpoints for every admin entity.

Each handler:
- Accepts a Pydantic model with all fields optional (partial update).
- Returns 404 if the row doesn't exist.
- Returns 409 if a delete is blocked by an FK reference.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import (
    Department,
    Program,
    School,
    Section,
    Subject,
    SubjectAssignment,
)
from app.models.user import FacultyMember, Student, User

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────


async def _commit_or_409(db: AsyncSession, what: str) -> None:
    """Commit; translate FK-violation IntegrityError into a friendly 409."""
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete {what}: it is referenced by other records",
        ) from e


def _apply(model_obj: object, updates: dict) -> None:
    for k, v in updates.items():
        if v is not None:
            setattr(model_obj, k, v)


# ─── Schools ─────────────────────────────────────────────


class SchoolUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    term_type: str | None = None
    min_attendance_pct: int | None = None


@router.patch("/schools/{school_id}")
async def update_school(
    school_id: UUID,
    body: SchoolUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    school = (await db.execute(select(School).where(School.id == school_id))).scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    _apply(school, body.model_dump(exclude_unset=True))
    await db.commit()
    return {"success": True}


@router.delete("/schools/{school_id}")
async def delete_school(
    school_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    school = (await db.execute(select(School).where(School.id == school_id))).scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    await db.delete(school)
    await _commit_or_409(db, "school")
    return {"success": True}


# ─── Departments ─────────────────────────────────────────


class DepartmentUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    school_id: UUID | None = None


@router.patch("/departments/{department_id}")
async def update_department(
    department_id: UUID,
    body: DepartmentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    dept = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    _apply(dept, body.model_dump(exclude_unset=True))
    await db.commit()
    return {"success": True}


@router.delete("/departments/{department_id}")
async def delete_department(
    department_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    dept = (
        await db.execute(select(Department).where(Department.id == department_id))
    ).scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    await db.delete(dept)
    await _commit_or_409(db, "department")
    return {"success": True}


# ─── Programs ────────────────────────────────────────────


class ProgramUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    duration_years: int | None = None
    department_id: UUID | None = None


@router.patch("/programs/{program_id}")
async def update_program(
    program_id: UUID,
    body: ProgramUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    prog = (
        await db.execute(select(Program).where(Program.id == program_id))
    ).scalar_one_or_none()
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    _apply(prog, body.model_dump(exclude_unset=True))
    await db.commit()
    return {"success": True}


@router.delete("/programs/{program_id}")
async def delete_program(
    program_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    prog = (
        await db.execute(select(Program).where(Program.id == program_id))
    ).scalar_one_or_none()
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    await db.delete(prog)
    await _commit_or_409(db, "program")
    return {"success": True}


# ─── Sections ────────────────────────────────────────────


class SectionUpdate(BaseModel):
    year: int | None = None
    division: str | None = None
    program_id: UUID | None = None


@router.patch("/sections/{section_id}")
async def update_section(
    section_id: UUID,
    body: SectionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    sec = (
        await db.execute(select(Section).where(Section.id == section_id))
    ).scalar_one_or_none()
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")
    _apply(sec, body.model_dump(exclude_unset=True))
    await db.commit()
    return {"success": True}


@router.delete("/sections/{section_id}")
async def delete_section(
    section_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    sec = (
        await db.execute(select(Section).where(Section.id == section_id))
    ).scalar_one_or_none()
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")
    await db.delete(sec)
    await _commit_or_409(db, "section")
    return {"success": True}


# ─── Faculty ─────────────────────────────────────────────


class FacultyUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    employee_id: str | None = None
    department_id: UUID | None = None


@router.patch("/faculty/{faculty_id}")
async def update_faculty(
    faculty_id: UUID,
    body: FacultyUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    fac = (
        await db.execute(select(FacultyMember).where(FacultyMember.id == faculty_id))
    ).scalar_one_or_none()
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty not found")

    user = (await db.execute(select(User).where(User.id == fac.user_id))).scalar_one()
    updates = body.model_dump(exclude_unset=True)
    if "full_name" in updates and updates["full_name"] is not None:
        user.full_name = updates["full_name"]
    if "phone" in updates:
        user.phone = updates["phone"]
    if "employee_id" in updates and updates["employee_id"] is not None:
        fac.employee_id = updates["employee_id"]
    if "department_id" in updates and updates["department_id"] is not None:
        fac.department_id = updates["department_id"]

    await db.commit()
    return {"success": True}


@router.delete("/faculty/{faculty_id}")
async def delete_faculty(
    faculty_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    fac = (
        await db.execute(select(FacultyMember).where(FacultyMember.id == faculty_id))
    ).scalar_one_or_none()
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty not found")
    await db.delete(fac)
    await _commit_or_409(db, "faculty")
    return {"success": True}


# ─── Subjects ────────────────────────────────────────────


class SubjectUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    department_id: UUID | None = None
    credits: int | None = None
    type: str | None = None


@router.patch("/subjects/{subject_id}")
async def update_subject(
    subject_id: UUID,
    body: SubjectUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    subj = (
        await db.execute(select(Subject).where(Subject.id == subject_id))
    ).scalar_one_or_none()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")
    _apply(subj, body.model_dump(exclude_unset=True))
    await db.commit()
    return {"success": True}


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    subj = (
        await db.execute(select(Subject).where(Subject.id == subject_id))
    ).scalar_one_or_none()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.delete(subj)
    await _commit_or_409(db, "subject")
    return {"success": True}


# ─── Assignments ─────────────────────────────────────────


class AssignmentUpdate(BaseModel):
    subject_id: UUID | None = None
    faculty_id: UUID | None = None
    section_id: UUID | None = None
    academic_year: int | None = None
    term: int | None = None


@router.patch("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: UUID,
    body: AssignmentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    a = (
        await db.execute(select(SubjectAssignment).where(SubjectAssignment.id == assignment_id))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _apply(a, body.model_dump(exclude_unset=True))
    await db.commit()
    return {"success": True}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    a = (
        await db.execute(select(SubjectAssignment).where(SubjectAssignment.id == assignment_id))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(a)
    await _commit_or_409(db, "assignment")
    return {"success": True}


# ─── Students ────────────────────────────────────────────


class StudentUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    enrollment_no: str | None = None
    section_id: UUID | None = None
    admitted_year: int | None = None


@router.patch("/students/{student_id}")
async def update_student(
    student_id: UUID,
    body: StudentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    stu = (
        await db.execute(select(Student).where(Student.id == student_id))
    ).scalar_one_or_none()
    if not stu:
        raise HTTPException(status_code=404, detail="Student not found")

    user = (await db.execute(select(User).where(User.id == stu.user_id))).scalar_one()
    updates = body.model_dump(exclude_unset=True)
    if "full_name" in updates and updates["full_name"] is not None:
        user.full_name = updates["full_name"]
    if "phone" in updates:
        user.phone = updates["phone"]
    if "enrollment_no" in updates and updates["enrollment_no"] is not None:
        stu.enrollment_no = updates["enrollment_no"]
    if "section_id" in updates and updates["section_id"] is not None:
        stu.section_id = updates["section_id"]
    if "admitted_year" in updates and updates["admitted_year"] is not None:
        stu.admitted_year = updates["admitted_year"]

    await db.commit()
    return {"success": True}


@router.delete("/students/{student_id}")
async def delete_student(
    student_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    stu = (
        await db.execute(select(Student).where(Student.id == student_id))
    ).scalar_one_or_none()
    if not stu:
        raise HTTPException(status_code=404, detail="Student not found")
    await db.delete(stu)
    await _commit_or_409(db, "student")
    return {"success": True}
