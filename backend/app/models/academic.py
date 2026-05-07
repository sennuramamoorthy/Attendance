from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base

term_type_enum = ENUM("semester", "yearly", name="term_type", create_type=False)
subject_type_enum = ENUM("theory", "lab", "tutorial", name="subject_type", create_type=False)


class School(Base):
    __tablename__ = "schools"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    term_type: Mapped[str] = mapped_column(term_type_enum, nullable=False, default="semester")
    min_attendance_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("schools.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    head_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    department_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    duration_years: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    program_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("programs.id"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    division: Mapped[str] = mapped_column(Text, nullable=False, default="A")
    cic_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    # Default classroom (where students sit). Faculty rotate through rooms;
    # students stay put. Nullable so existing rows survive migration —
    # newly created sections should always set this.
    room: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SchoolPeriod(Base):
    """The master period grid for a school. Back-to-back time slots, possibly
    interrupted by `is_break=True` rows (e.g. Lunch). All sections in the
    school share this grid — class_schedules.period_number references it."""

    __tablename__ = "school_periods"
    __table_args__ = (
        UniqueConstraint("school_id", "period_number", name="uq_school_period"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("schools.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_number: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    label: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_break: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AcademicTerm(Base):
    __tablename__ = "academic_terms"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    school_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("schools.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    department_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    type: Mapped[str] = mapped_column(subject_type_enum, nullable=False, default="theory")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SubjectAssignment(Base):
    __tablename__ = "subject_assignments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    subject_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False
    )
    faculty_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("faculty_members.id"), nullable=False
    )
    section_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("sections.id"), nullable=False
    )
    academic_year: Mapped[int] = mapped_column(Integer, nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ClassSchedule(Base):
    __tablename__ = "class_schedules"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    subject_assignment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("subject_assignments.id"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    # Period reference (preferred for new schedules). When set, start_time
    # and end_time are denormalised copies of the (period .. period+duration-1)
    # range from the school's grid — kept in sync at insert time so existing
    # queries that read times don't need a join.
    period_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_periods: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    # Optional room override. Null → use the section's default classroom
    # (Section.room). Labs typically set this to a lab block (e.g. E-Lab1).
    room: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
