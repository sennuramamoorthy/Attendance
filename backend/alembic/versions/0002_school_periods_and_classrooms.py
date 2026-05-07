"""school-level period grid + section classrooms + period-based schedules

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-06 10:00:00.000000

Models the way Indian universities actually run timetables:

- A school defines a master period grid (P1, P2, …, possibly with a Lunch
  break row) — back-to-back, no gaps. All sections in that school share it.
- Each section has a fixed classroom; students stay put.
- Faculty rotate through rooms — the schedule for a class references the
  school's period number rather than carrying its own start/end times.
- Labs may span multiple periods (`duration_periods`) and run in a different
  room (e.g. lab block) — the existing `class_schedules.room` is now an
  override; null means "use the section's classroom".

`start_time` / `end_time` on `class_schedules` are kept as denormalised
copies of (period_number → school period grid) so existing queries
(faculty schedule, student schedule) keep working without a join.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # School-level master period grid.
    # UNIQUE (school_id, period_number) so each school has one slot per number.
    op.create_table(
        "school_periods",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "school_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_number", sa.Integer, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("label", sa.Text, nullable=True),
        sa.Column(
            "is_break",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("school_id", "period_number", name="uq_school_period"),
    )
    op.create_index(
        "ix_school_periods_school_id", "school_periods", ["school_id"]
    )

    # Each section's default classroom (where students sit). Nullable for now —
    # admins can backfill via the section edit UI; existing data won't break.
    op.add_column("sections", sa.Column("room", sa.Text, nullable=True))

    # Schedule: reference the school's period grid + allow multi-period blocks.
    # Existing rows keep their start/end times; new rows can be created either
    # way (period-based recommended) and the seed script materialises both.
    op.add_column(
        "class_schedules",
        sa.Column("period_number", sa.Integer, nullable=True),
    )
    op.add_column(
        "class_schedules",
        sa.Column(
            "duration_periods",
            sa.Integer,
            nullable=False,
            server_default="1",
        ),
    )

    # `room` becomes optional (null → use section.room). Existing rows already
    # have a value so this is purely a relaxation.
    op.alter_column("class_schedules", "room", nullable=True)


def downgrade() -> None:
    # Reverse order: schedule changes → section.room → school_periods.
    op.alter_column("class_schedules", "room", nullable=False)
    op.drop_column("class_schedules", "duration_periods")
    op.drop_column("class_schedules", "period_number")

    op.drop_column("sections", "room")

    op.drop_index("ix_school_periods_school_id", table_name="school_periods")
    op.drop_table("school_periods")
