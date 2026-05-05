from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base

session_status_enum = ENUM(
    "active", "closed", "cancelled", name="session_status", create_type=False
)

attendance_status_enum = ENUM(
    "present", "absent", "late", "excused", name="attendance_status", create_type=False
)

marked_by_enum = ENUM(
    "qr_scan",
    "manual_cic",
    "manual_faculty",
    "system",
    name="marked_by",
    create_type=False,
)


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    subject_assignment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("subject_assignments.id"), nullable=False
    )
    class_schedule_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("class_schedules.id"), nullable=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    faculty_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)
    faculty_lng: Mapped[Decimal | None] = mapped_column(Numeric(11, 8), nullable=True)
    qr_secret: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        session_status_enum, nullable=False, default="active"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("attendance_sessions.id"), nullable=False
    )
    student_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("students.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        attendance_status_enum, nullable=False, default="present"
    )
    marked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    marked_by: Mapped[str] = mapped_column(marked_by_enum, nullable=False, default="qr_scan")
    device_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)
    student_lng: Mapped[Decimal | None] = mapped_column(Numeric(11, 8), nullable=True)
    flagged: Mapped[bool] = mapped_column(default=False, nullable=False)
    flag_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
