from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import Student, User, UserRole
from app.schemas.common import RosterStudent

router = APIRouter()


class ManualMarkRequest(BaseModel):
    student_id: UUID
    session_id: UUID
    status: str = "present"


@router.get("/roster", response_model=list[RosterStudent])
async def get_roster(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RosterStudent]:
    cic = (
        await db.execute(
            select(UserRole).where(
                and_(UserRole.user_id == current_user.id, UserRole.role == "cic")
            )
        )
    ).scalar_one_or_none()
    if not cic or not cic.scope_id:
        raise HTTPException(status_code=403, detail="Not a CIC or no section assigned")

    students = (
        await db.execute(
            select(Student.id, User.full_name, Student.enrollment_no)
            .join(User, Student.user_id == User.id)
            .where(Student.section_id == cic.scope_id)
        )
    ).all()

    today = date.today()
    today_records = (
        await db.execute(
            select(
                AttendanceRecord.student_id,
                AttendanceRecord.id,
                AttendanceRecord.status,
                AttendanceRecord.marked_by,
            )
            .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
            .where(AttendanceSession.session_date == today)
        )
    ).all()

    record_map = {
        sid: {"record_id": rid, "status": status, "marked_by": mb}
        for sid, rid, status, mb in today_records
    }

    return [
        RosterStudent(
            id=sid,
            record_id=record_map.get(sid, {}).get("record_id"),
            name=name,
            enrollment_no=enrollment,
            status=record_map.get(sid, {}).get("status"),
            marked_by=record_map.get(sid, {}).get("marked_by"),
        )
        for sid, name, enrollment in students
    ]


@router.post("/manual-mark")
async def manual_mark(
    body: ManualMarkRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    cic = (
        await db.execute(
            select(UserRole).where(
                and_(UserRole.user_id == current_user.id, UserRole.role == "cic")
            )
        )
    ).scalar_one_or_none()
    if not cic:
        raise HTTPException(status_code=403, detail="Not authorized as CIC")

    existing = (
        await db.execute(
            select(AttendanceRecord).where(
                and_(
                    AttendanceRecord.session_id == body.session_id,
                    AttendanceRecord.student_id == body.student_id,
                )
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.status = body.status
        existing.marked_by = "manual_cic"
        existing.marked_at = datetime.now(UTC)
    else:
        record = AttendanceRecord(
            session_id=body.session_id,
            student_id=body.student_id,
            status=body.status,
            marked_by="manual_cic",
        )
        db.add(record)

    await db.commit()
    return {"success": True}
