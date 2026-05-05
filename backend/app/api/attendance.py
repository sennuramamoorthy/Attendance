from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.academic import SubjectAssignment
from app.models.attendance import AttendanceRecord, AttendanceSession
from app.models.user import FacultyMember, Student, UserRole
from app.schemas.attendance import (
    CloseSessionRequest,
    MarkAttendanceRequest,
    MarkAttendanceResponse,
    QrTokenRequest,
    QrTokenResponse,
    SessionCount,
    StartSessionRequest,
    StartSessionResponse,
    UpdateRecordRequest,
)
from app.services.device_service import validate_device
from app.services.geo_service import is_within_range
from app.services.qr_service import generate_qr_token, generate_session_secret, verify_qr_token

router = APIRouter()


@router.post("/sessions", response_model=StartSessionResponse)
async def start_session(
    body: StartSessionRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StartSessionResponse:
    faculty = (
        await db.execute(select(FacultyMember).where(FacultyMember.user_id == current_user.id))
    ).scalar_one_or_none()
    if not faculty:
        raise HTTPException(status_code=403, detail="Not a faculty member")

    assignment = (
        await db.execute(
            select(SubjectAssignment).where(
                and_(
                    SubjectAssignment.id == body.subject_assignment_id,
                    SubjectAssignment.faculty_id == faculty.id,
                )
            )
        )
    ).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Subject assignment not found or not yours")

    secret = generate_session_secret()
    session = AttendanceSession(
        subject_assignment_id=body.subject_assignment_id,
        class_schedule_id=body.class_schedule_id,
        session_date=date.today(),
        faculty_lat=body.lat,
        faculty_lng=body.lng,
        qr_secret=secret,
        status="active",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return StartSessionResponse(
        session_id=session.id, secret=secret, started_at=session.started_at
    )


@router.patch("/sessions")
async def close_session(
    body: CloseSessionRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    session = (
        await db.execute(
            select(AttendanceSession).where(AttendanceSession.id == body.session_id)
        )
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "closed"
    session.ended_at = datetime.now(UTC)
    await db.commit()
    return {"success": True}


@router.get("/sessions/{session_id}/count", response_model=SessionCount)
async def get_session_count(
    session_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionCount:
    count = (
        await db.execute(
            select(func.count()).select_from(AttendanceRecord).where(
                AttendanceRecord.session_id == session_id
            )
        )
    ).scalar_one()
    return SessionCount(count=count)


@router.post("/qr-token", response_model=QrTokenResponse)
async def issue_qr_token(body: QrTokenRequest) -> QrTokenResponse:
    token = generate_qr_token(str(body.session_id), body.rotation_index, body.secret)
    return QrTokenResponse(token=token)


@router.post("/mark", response_model=MarkAttendanceResponse)
async def mark_attendance(
    body: MarkAttendanceRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MarkAttendanceResponse:
    student = (
        await db.execute(select(Student).where(Student.user_id == current_user.id))
    ).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=403, detail="Not a student")

    valid, reason = validate_device(body.device_fingerprint, student.device_fingerprint)
    if not valid:
        raise HTTPException(status_code=403, detail=reason)

    active_sessions = (
        await db.execute(
            select(AttendanceSession).where(AttendanceSession.status == "active")
        )
    ).scalars().all()

    matched = None
    for session in active_sessions:
        payload = verify_qr_token(body.token, session.qr_secret)
        if payload and payload.get("sessionId") == str(session.id):
            matched = session
            break

    if not matched:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired QR code. Ask faculty to refresh.",
        )

    existing = (
        await db.execute(
            select(AttendanceRecord).where(
                and_(
                    AttendanceRecord.session_id == matched.id,
                    AttendanceRecord.student_id == student.id,
                )
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Attendance already marked for this session")

    if matched.faculty_lat is None or matched.faculty_lng is None:
        raise HTTPException(status_code=500, detail="Session location not available")

    in_range, distance = is_within_range(
        body.lat, body.lng, float(matched.faculty_lat), float(matched.faculty_lng)
    )
    if not in_range:
        raise HTTPException(
            status_code=403,
            detail=f"You are {distance}m away. Must be within 15m of the classroom.",
        )

    record = AttendanceRecord(
        session_id=matched.id,
        student_id=student.id,
        status="present",
        marked_by="qr_scan",
        device_fingerprint=body.device_fingerprint,
        student_lat=body.lat,
        student_lng=body.lng,
    )
    db.add(record)

    if not student.device_fingerprint:
        student.device_fingerprint = body.device_fingerprint

    await db.commit()
    await db.refresh(record)

    return MarkAttendanceResponse(
        success=True,
        record={"id": record.id, "status": record.status, "marked_at": record.marked_at},
    )


@router.patch("/records/{record_id}")
async def update_record(
    record_id: UUID,
    body: UpdateRecordRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    cic_role = (
        await db.execute(
            select(UserRole).where(
                and_(UserRole.user_id == current_user.id, UserRole.role == "cic")
            )
        )
    ).scalar_one_or_none()
    if not cic_role:
        raise HTTPException(
            status_code=403, detail="Only Class-in-Charge can manually update attendance"
        )

    record = (
        await db.execute(select(AttendanceRecord).where(AttendanceRecord.id == record_id))
    ).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    record.status = body.status
    record.marked_by = "manual_cic"
    record.marked_at = datetime.now(UTC)
    await db.commit()
    return {"success": True}
