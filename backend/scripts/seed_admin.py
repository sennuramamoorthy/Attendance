"""Bootstrap an admin login.

Creates a Supabase auth user (gotrue) and links it to public.users + user_roles
(role='admin', scope='global'). Idempotent — safe to re-run; updates the password
if the email already exists.

Usage: python scripts/seed_admin.py <email> <password>
"""

import asyncio
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services.gotrue_admin import upsert_auth_user


async def main(email: str, password: str) -> None:
    print(f"→ Creating gotrue user for {email}")
    user_id = await upsert_auth_user(email, password)
    print(f"→ Auth user: {user_id}")

    async with AsyncSessionLocal() as db:
        existing_user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if not existing_user:
            db.add(User(id=user_id, email=email, full_name="Administrator"))
            await db.flush()
            print("→ public.users row created")
        else:
            print("→ public.users row already present")

        existing_role = (
            await db.execute(
                select(UserRole).where(
                    UserRole.user_id == user_id, UserRole.role == "admin"
                )
            )
        ).scalar_one_or_none()
        if not existing_role:
            db.add(UserRole(user_id=user_id, role="admin", scope_type="global"))
            print("→ admin role granted")
        else:
            print("→ admin role already present")

        await db.commit()

    print(f"\n✓ {email} can now log in as admin (password: {password})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python scripts/seed_admin.py <email> <password>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
