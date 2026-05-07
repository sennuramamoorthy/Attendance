from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.academic import ClassSchedule, Section, Subject, SubjectAssignment
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import FacultyMember, Student, User
from app.schemas.common import StudentScheduleItem, StudentSummary

router = APIRouter()


@router.get("/me", response_model=StudentSummary)
async def get_summary(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StudentSummary:
    student = (
        await db.execute(select(Student).where(Student.user_id == current_user.id))
    ).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    user = (
        await db.execute(select(User).where(User.id == current_user.id))
    ).scalar_one()

    total = (
        await db.execute(
            select(func.count()).select_from(AttendanceRecord).where(
                AttendanceRecord.student_id == student.id
            )
        )
    ).scalar_one()
    present = (
        await db.execute(
            select(func.count()).select_from(AttendanceRecord).where(
                and_(
                    AttendanceRecord.student_id == student.id,
                    AttendanceRecord.status == "present",
                )
            )
        )
    ).scalar_one()

    pct = (present / total * 100) if total > 0 else 0
    return StudentSummary(
        enrollment_no=student.enrollment_no,
        full_name=user.full_name,
        overall_percentage=round(pct, 1),
        total_classes=total,
        present_classes=present,
    )


@router.get("/schedule", response_model=list[StudentScheduleItem])
async def get_schedule(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[StudentScheduleItem]:
    student = (
        await db.execute(select(Student).where(Student.user_id == current_user.id))
    ).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    today = date.today()
    py_dow = today.weekday()  # Mon=0, Sun=6 (already correct)

    # Section's default classroom — used when class_schedules.room is null
    # (theory classes; labs always set their own room override).
    section = (
        await db.execute(select(Section).where(Section.id == student.section_id))
    ).scalar_one()
    default_room = section.room or "—"

    rows = (
        await db.execute(
            select(
                ClassSchedule.id,
                ClassSchedule.start_time,
                ClassSchedule.end_time,
                ClassSchedule.room,
                Subject.code,
                Subject.name,
                User.full_name,
                SubjectAssignment.id,
            )
            .join(SubjectAssignment, ClassSchedule.subject_assignment_id == SubjectAssignment.id)
            .join(Subject, SubjectAssignment.subject_id == Subject.id)
            .join(FacultyMember, SubjectAssignment.faculty_id == FacultyMember.id)
            .join(User, FacultyMember.user_id == User.id)
            .where(
                and_(
                    SubjectAssignment.section_id == student.section_id,
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

    my_records = (
        await db.execute(
            select(AttendanceRecord.session_id).where(AttendanceRecord.student_id == student.id)
        )
    ).scalars().all()
    marked_ids = set(my_records)

    result = []
    for sched_id, start, end, room, code, name, faculty_name, assignment_id in rows:
        session = session_by_assignment.get(assignment_id)
        result.append(
            StudentScheduleItem(
                schedule_id=sched_id,
                assignment_id=assignment_id,
                start_time=start,
                end_time=end,
                # class_schedules.room is null for theory classes that run
                # in the section's default classroom — fall back to that.
                room=room or default_room,
                subject_code=code,
                subject_name=name,
                faculty_name=faculty_name,
                session_id=session.id if session else None,
                session_status=session.status if session else None,
                is_marked=session is not None and session.id in marked_ids,
            )
        )
    return result
