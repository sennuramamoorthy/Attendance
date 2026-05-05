from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import School
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import FacultyMember, Student
from app.schemas.common import SchoolOut

router = APIRouter()


@router.get("/overview")
async def get_overview(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    today = date.today()

    schools = (await db.execute(select(School))).scalars().all()
    total_students = (
        await db.execute(select(func.count()).select_from(Student))
    ).scalar_one()
    total_faculty = (
        await db.execute(select(func.count()).select_from(FacultyMember))
    ).scalar_one()
    today_sessions = (
        await db.execute(
            select(func.count()).select_from(AttendanceSession).where(
                AttendanceSession.session_date == today
            )
        )
    ).scalar_one()
    today_present = (
        await db.execute(
            select(func.count())
            .select_from(AttendanceRecord)
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .where(
                and_(
                    AttendanceSession.session_date == today,
                    AttendanceRecord.status == "present",
                )
            )
        )
    ).scalar_one()
    active_sessions = (
        await db.execute(
            select(func.count()).select_from(AttendanceSession).where(
                and_(
                    AttendanceSession.session_date == today,
                    AttendanceSession.status == "active",
                )
            )
        )
    ).scalar_one()

    return {
        "schools": [SchoolOut.model_validate(s).model_dump(mode="json") for s in schools],
        "total_students": total_students,
        "total_faculty": total_faculty,
        "today_sessions": today_sessions,
        "today_present": today_present,
        "active_sessions": active_sessions,
    }
