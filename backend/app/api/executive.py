from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.academic import School
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.schemas.common import SchoolOut

router = APIRouter()


@router.get("/overview")
async def get_overview(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    schools = (await db.execute(select(School))).scalars().all()

    total_sessions = (
        await db.execute(select(func.count()).select_from(AttendanceSession))
    ).scalar_one()

    total_records = (
        await db.execute(select(func.count()).select_from(AttendanceRecord))
    ).scalar_one()

    total_present = (
        await db.execute(
            select(func.count()).select_from(AttendanceRecord).where(
                AttendanceRecord.status == "present"
            )
        )
    ).scalar_one()

    overall_pct = (total_present / total_records * 100) if total_records > 0 else 0

    return {
        "schools": [SchoolOut.model_validate(s).model_dump(mode="json") for s in schools],
        "total_sessions": total_sessions,
        "total_records": total_records,
        "overall_percentage": round(overall_pct, 1),
    }
