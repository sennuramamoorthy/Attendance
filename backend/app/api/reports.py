from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import Department, School, Subject, SubjectAssignment
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import Student, User
from app.schemas.common import ReportNode, ReportResponse

router = APIRouter()


@router.get("", response_model=ReportResponse)
async def get_report(
    db: Annotated[AsyncSession, Depends(get_db)],
    type: str = Query(default="university"),
    id: str | None = Query(default=None),
) -> ReportResponse:
    children: list[ReportNode] = []

    if type == "university":
        rows = (await db.execute(select(School))).scalars().all()
        children = [
            ReportNode(type="school", id=str(s.id), label=s.name, percentage=None) for s in rows
        ]

    elif type == "school" and id:
        rows = (
            await db.execute(select(Department).where(Department.school_id == UUID(id)))
        ).scalars().all()
        children = [
            ReportNode(type="department", id=str(d.id), label=d.name, percentage=None)
            for d in rows
        ]

    elif type == "department" and id:
        rows = (
            await db.execute(select(Subject).where(Subject.department_id == UUID(id)))
        ).scalars().all()
        children = [
            ReportNode(
                type="subject", id=str(s.id), label=f"{s.code} {s.name}", percentage=None
            )
            for s in rows
        ]

    elif type == "subject" and id:
        assignments = (
            await db.execute(
                select(SubjectAssignment).where(SubjectAssignment.subject_id == UUID(id))
            )
        ).scalars().all()

        for a in assignments:
            students = (
                await db.execute(
                    select(Student.id, User.full_name, Student.enrollment_no)
                    .join(User, Student.user_id == User.id)
                    .where(Student.section_id == a.section_id)
                )
            ).all()

            for sid, name, enroll in students:
                total = (
                    await db.execute(
                        select(func.count())
                        .select_from(AttendanceRecord)
                        .join(
                            AttendanceSession,
                            AttendanceRecord.session_id == AttendanceSession.id,
                        )
                        .where(
                            and_(
                                AttendanceRecord.student_id == sid,
                                AttendanceSession.subject_assignment_id == a.id,
                            )
                        )
                    )
                ).scalar_one()
                present = (
                    await db.execute(
                        select(func.count())
                        .select_from(AttendanceRecord)
                        .join(
                            AttendanceSession,
                            AttendanceRecord.session_id == AttendanceSession.id,
                        )
                        .where(
                            and_(
                                AttendanceRecord.student_id == sid,
                                AttendanceSession.subject_assignment_id == a.id,
                                AttendanceRecord.status == "present",
                            )
                        )
                    )
                ).scalar_one()
                pct = (present / total * 100) if total > 0 else None
                children.append(
                    ReportNode(
                        type="student",
                        id=str(sid),
                        label=f"{name} · {enroll}",
                        percentage=pct,
                    )
                )

    return ReportResponse(children=children)
