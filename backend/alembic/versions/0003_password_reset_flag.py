"""users.password_reset_required flag for forced first-login change

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-06 11:30:00.000000

When admin creates a user (or onboards a bulk-uploaded user), the password
that's generated/typed-in is a *temp* — the user must change it before the
session is usable. We track that with a flag on `users` so:

  - /api/me can surface it to the frontend
  - the dashboard layout can redirect to /account/reset-password
  - /api/me/clear-password-reset can flip it once the user finishes
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Default false so existing users keep working — only freshly provisioned
    # users get this set to true by the create/onboard handlers.
    op.add_column(
        "users",
        sa.Column(
            "password_reset_required",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "password_reset_required")
