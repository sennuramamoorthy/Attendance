from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter()


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    roles: list[str]
    # True when the user's current password is a temp set by an admin and
    # they must change it before the session is usable. The dashboard layout
    # redirects to /account/reset-password when this is true.
    password_reset_required: bool = False


@router.get("", response_model=MeResponse)
async def get_me(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MeResponse:
    # The CurrentUser wrapper doesn't carry the flag — pull it directly so
    # we don't have to widen that core type for one consumer.
    user = (
        await db.execute(select(User).where(User.id == current_user.id))
    ).scalar_one()
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        roles=sorted(current_user.role_names()),
        password_reset_required=user.password_reset_required,
    )


@router.post("/clear-password-reset")
async def clear_password_reset(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    """Called by the frontend after the user has successfully changed their
    password via Supabase auth on the forced-reset page. Flips the flag so
    subsequent logins go straight to the dashboard."""
    user = (
        await db.execute(select(User).where(User.id == current_user.id))
    ).scalar_one()
    user.password_reset_required = False
    await db.commit()
    return {"success": True}
