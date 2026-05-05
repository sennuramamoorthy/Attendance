from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, UserRole


class CurrentUser:
    def __init__(
        self, user_id: UUID, email: str, full_name: str | None, roles: list[UserRole]
    ):
        self.id = user_id
        self.email = email
        self.full_name = full_name
        self.roles = roles

    def has_role(self, role: str, scope_id: UUID | None = None) -> bool:
        return any(
            r.role == role and (scope_id is None or r.scope_id == scope_id)
            for r in self.roles
        )

    def role_names(self) -> set[str]:
        return {r.role for r in self.roles}


async def verify_supabase_token(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail="Token expired") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}") from e

    return payload


async def get_current_user(
    payload: Annotated[dict, Depends(verify_supabase_token)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentUser:
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim")

    try:
        user_id = UUID(user_id_str)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Invalid user ID in token") from e

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found in database")

    roles_result = await db.execute(select(UserRole).where(UserRole.user_id == user_id))
    roles = list(roles_result.scalars().all())

    return CurrentUser(user_id=user.id, email=user.email, full_name=user.full_name, roles=roles)


def require_role(*allowed_roles: str):
    async def checker(
        current_user: Annotated[CurrentUser, Depends(get_current_user)],
    ) -> CurrentUser:
        if not current_user.role_names().intersection(allowed_roles):
            raise HTTPException(
                status_code=403,
                detail=f"Requires one of: {', '.join(allowed_roles)}",
            )
        return current_user

    return checker
