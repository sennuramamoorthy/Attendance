from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import (
    Department,
    Program,
    School,
    Section,
    SubjectAssignment,
)
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import Student, User

router = APIRouter()


class AtRiskStudent(BaseModel):
    student_id: str
    name: str
    enrollment_no: str
    section_label: str
    school_code: str
    school_min_pct: int
    overall_percentage: float
    total_classes: int
    present_classes: int


@router.get("", response_model=list[AtRiskStudent])
async def at_risk(
    db: Annotated[AsyncSession, Depends(get_db)],
    school_code: str | None = Query(default=None, description="Filter by school code"),
) -> list[AtRiskStudent]:
    """Students whose attendance is below their school's `min_attendance_pct`."""

    rows = (
        await db.execute(
            select(
                Student.id,
                User.full_name,
                Student.enrollment_no,
                Section.year,
                Section.division,
                Program.name,
                School.code,
                School.min_attendance_pct,
            )
            .join(User, Student.user_id == User.id)
            .join(Section, Student.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .join(Department, Program.department_id == Department.id)
            .join(School, Department.school_id == School.id)
            .where(School.code == school_code if school_code else True)
        )
    ).all()

    result: list[AtRiskStudent] = []
    for sid, name, enroll, year, div, prog, scode, smin in rows:
        total = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(AttendanceRecord.student_id == sid)
            )
        ).scalar_one()
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    and_(
                        AttendanceRecord.student_id == sid,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()

        if total == 0:
            continue

        pct = present / total * 100
        if pct < smin:
            result.append(
                AtRiskStudent(
                    student_id=str(sid),
                    name=name,
                    enrollment_no=enroll,
                    section_label=f"{prog} · Y{year} {div}",
                    school_code=scode,
                    school_min_pct=smin,
                    overall_percentage=round(pct, 1),
                    total_classes=total,
                    present_classes=present,
                )
            )

    result.sort(key=lambda s: s.overall_percentage)
    return result


class AssignmentAttendanceItem(BaseModel):
    session_id: str
    session_date: str
    started_at: str
    ended_at: str | None
    present_count: int
    total_students: int


@router.get("/assignment/{assignment_id}/sessions", response_model=list[AssignmentAttendanceItem])
async def assignment_history(
    assignment_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AssignmentAttendanceItem]:
    """Attendance history for a single subject assignment (faculty drill-down)."""

    sessions = (
        await db.execute(
            select(AttendanceSession)
            .where(AttendanceSession.subject_assignment_id == assignment_id)
            .order_by(AttendanceSession.session_date.desc(), AttendanceSession.started_at.desc())
        )
    ).scalars().all()

    if not sessions:
        return []

    assignment = (
        await db.execute(
            select(SubjectAssignment).where(SubjectAssignment.id == assignment_id)
        )
    ).scalar_one()

    total_students = (
        await db.execute(
            select(func.count())
            .select_from(Student)
            .where(Student.section_id == assignment.section_id)
        )
    ).scalar_one()

    result = []
    for s in sessions:
        present = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    and_(
                        AttendanceRecord.session_id == s.id,
                        AttendanceRecord.status == "present",
                    )
                )
            )
        ).scalar_one()
        result.append(
            AssignmentAttendanceItem(
                session_id=str(s.id),
                session_date=s.session_date.isoformat(),
                started_at=s.started_at.isoformat(),
                ended_at=s.ended_at.isoformat() if s.ended_at else None,
                present_count=present,
                total_students=total_students,
            )
        )

    return result
