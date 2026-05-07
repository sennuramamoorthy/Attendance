from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base

role_enum = ENUM(
    "admin",
    "student",
    "faculty",
    "cic",
    "hod",
    "dean",
    "registrar",
    "vc",
    "chancellor",
    name="role",
    create_type=False,
)

scope_type_enum = ENUM(
    "global",
    "school",
    "department",
    "section",
    name="scope_type",
    create_type=False,
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True when the user's current password is a temp set by an admin (single-
    # create or bulk-onboard). The frontend redirects to a forced-reset page
    # on next login until this is cleared via /api/me/clear-password-reset.
    password_reset_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(role_enum, nullable=False)
    scope_type: Mapped[str] = mapped_column(
        scope_type_enum, nullable=False, default="global"
    )
    scope_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Student(Base):
    __tablename__ = "students"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    enrollment_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    section_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("sections.id"), nullable=False
    )
    device_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    admitted_year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class FacultyMember(Base):
    __tablename__ = "faculty_members"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    employee_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    department_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
