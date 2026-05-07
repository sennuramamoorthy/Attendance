from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.academic import (
    ClassSchedule,
    Program,
    Section,
    Subject,
    SubjectAssignment,
)
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import FacultyMember
from app.schemas.common import FacultyScheduleItem

router = APIRouter()


@router.get("/schedule", response_model=list[FacultyScheduleItem])
async def get_schedule(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FacultyScheduleItem]:
    faculty = (
        await db.execute(select(FacultyMember).where(FacultyMember.user_id == current_user.id))
    ).scalar_one_or_none()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty profile not found")

    today = date.today()
    py_dow = today.weekday()

    rows = (
        await db.execute(
            select(
                ClassSchedule.id,
                ClassSchedule.start_time,
                ClassSchedule.end_time,
                ClassSchedule.room,
                Section.room,  # default classroom per row (faculty rotates)
                Subject.code,
                Subject.name,
                Section.year,
                Section.division,
                Program.name,
                SubjectAssignment.id,
            )
            .join(SubjectAssignment, ClassSchedule.subject_assignment_id == SubjectAssignment.id)
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(Section, SubjectAssignment.section_id == Section.id)
            .join(Program, Section.program_id == Program.id)
            .where(
                and_(
                    SubjectAssignment.faculty_id == faculty.id,
                    ClassSchedule.day_of_week == py_dow,
                )
            )
            .order_by(ClassSchedule.start_time)
        )
    ).all()

    sessions = (
        await db.execute(
            select(AttendanceSession).where(AttendanceSession.session_date == today)
        )
    ).scalars().all()
    session_by_assignment = {s.subject_assignment_id: s for s in sessions}

    result = []
    for (
        sched_id,
        start,
        end,
        room,
        section_room,
        code,
        sub_name,
        year,
        division,
        program_name,
        assignment_id,
    ) in rows:
        session = session_by_assignment.get(assignment_id)
        result.append(
            FacultyScheduleItem(
                schedule_id=sched_id,
                assignment_id=assignment_id,
                start_time=start,
                end_time=end,
                # class_schedules.room is null for theory in the section's
                # own classroom — fall back to Section.room (faculty rotates
                # between classrooms across sections).
                room=room or section_room or "—",
                subject_code=code,
                subject_name=sub_name,
                section_year=year,
                section_division=division,
                program_name=program_name,
                session_id=session.id if session else None,
                session_status=session.status if session else None,
            )
        )
    return result


@router.get("/stats")
async def get_stats(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    faculty = (
        await db.execute(select(FacultyMember).where(FacultyMember.user_id == current_user.id))
    ).scalar_one_or_none()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty profile not found")

    today = date.today()
    today_students = (
        await db.execute(
            select(func.count(func.distinct(AttendanceRecord.student_id)))
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .where(AttendanceSession.session_date == today)
        )
    ).scalar_one()

    return {"today_students": today_students or 0}
