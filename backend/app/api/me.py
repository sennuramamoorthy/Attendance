from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user

router = APIRouter()


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    roles: list[str]


@router.get("", response_model=MeResponse)
async def get_me(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> MeResponse:
    return MeResponse(
        id=str(current_user.id),
        email=current_user.email,
        roles=sorted(current_user.role_names()),
    )
