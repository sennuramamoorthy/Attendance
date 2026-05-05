"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-03 22:55:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enums (created here so models with create_type=False can reference them)
    term_type = postgresql.ENUM("semester", "yearly", name="term_type")
    term_type.create(op.get_bind(), checkfirst=True)

    subject_type = postgresql.ENUM("theory", "lab", "tutorial", name="subject_type")
    subject_type.create(op.get_bind(), checkfirst=True)

    role = postgresql.ENUM(
        "admin", "student", "faculty", "cic", "hod", "dean", "registrar", "vc", "chancellor",
        name="role",
    )
    role.create(op.get_bind(), checkfirst=True)

    scope_type = postgresql.ENUM(
        "global", "school", "department", "section", name="scope_type"
    )
    scope_type.create(op.get_bind(), checkfirst=True)

    session_status = postgresql.ENUM(
        "active", "closed", "cancelled", name="session_status"
    )
    session_status.create(op.get_bind(), checkfirst=True)

    attendance_status = postgresql.ENUM(
        "present", "absent", "late", "excused", name="attendance_status"
    )
    attendance_status.create(op.get_bind(), checkfirst=True)

    marked_by = postgresql.ENUM(
        "qr_scan", "manual_cic", "manual_faculty", "system", name="marked_by"
    )
    marked_by.create(op.get_bind(), checkfirst=True)

    # Tables
    op.create_table(
        "schools",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("term_type", postgresql.ENUM(name="term_type", create_type=False), nullable=False, server_default="semester"),
        sa.Column("min_attendance_pct", sa.Integer, nullable=False, server_default="75"),
        sa.Column("config", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("full_name", sa.Text, nullable=False),
        sa.Column("phone", sa.Text, nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("head_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "programs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("duration_years", sa.Integer, nullable=False, server_default="4"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("program_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("division", sa.Text, nullable=False, server_default="A"),
        sa.Column("cic_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "academic_terms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schools.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "user_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", postgresql.ENUM(name="role", create_type=False), nullable=False),
        sa.Column("scope_type", postgresql.ENUM(name="scope_type", create_type=False), nullable=False, server_default="global"),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "students",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("enrollment_no", sa.Text, nullable=False, unique=True),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sections.id"), nullable=False),
        sa.Column("device_fingerprint", sa.Text, nullable=True),
        sa.Column("admitted_year", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "faculty_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("employee_id", sa.Text, nullable=False, unique=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "subjects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("credits", sa.Integer, nullable=False, server_default="3"),
        sa.Column("type", postgresql.ENUM(name="subject_type", create_type=False), nullable=False, server_default="theory"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "subject_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subjects.id"), nullable=False),
        sa.Column("faculty_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("faculty_members.id"), nullable=False),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sections.id"), nullable=False),
        sa.Column("academic_year", sa.Integer, nullable=False),
        sa.Column("term", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "class_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("subject_assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subject_assignments.id"), nullable=False),
        sa.Column("day_of_week", sa.Integer, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("room", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "attendance_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("subject_assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subject_assignments.id"), nullable=False),
        sa.Column("class_schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("class_schedules.id"), nullable=True),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("faculty_lat", sa.Numeric(10, 8), nullable=True),
        sa.Column("faculty_lng", sa.Numeric(11, 8), nullable=True),
        sa.Column("qr_secret", sa.Text, nullable=False),
        sa.Column("status", postgresql.ENUM(name="session_status", create_type=False), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "attendance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("attendance_sessions.id"), nullable=False),
        sa.Column("student_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("status", postgresql.ENUM(name="attendance_status", create_type=False), nullable=False, server_default="present"),
        sa.Column("marked_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("marked_by", postgresql.ENUM(name="marked_by", create_type=False), nullable=False, server_default="qr_scan"),
        sa.Column("device_fingerprint", sa.Text, nullable=True),
        sa.Column("student_lat", sa.Numeric(10, 8), nullable=True),
        sa.Column("student_lng", sa.Numeric(11, 8), nullable=True),
        sa.Column("flagged", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("flag_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_attendance_records_session_student",
        "attendance_records",
        ["session_id", "student_id"],
        unique=True,
    )

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("entity_type", sa.Text, nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_index("ix_attendance_records_session_student", table_name="attendance_records")
    op.drop_table("attendance_records")
    op.drop_table("attendance_sessions")
    op.drop_table("class_schedules")
    op.drop_table("subject_assignments")
    op.drop_table("subjects")
    op.drop_table("faculty_members")
    op.drop_table("students")
    op.drop_table("user_roles")
    op.drop_table("academic_terms")
    op.drop_table("sections")
    op.drop_table("programs")
    op.drop_table("departments")
    op.drop_table("users")
    op.drop_table("schools")

    for enum in ("marked_by", "attendance_status", "session_status", "scope_type", "role", "subject_type", "term_type"):
        op.execute(f"DROP TYPE IF EXISTS {enum}")
