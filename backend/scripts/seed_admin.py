"""Bootstrap an admin login.

Creates a Supabase auth user (gotrue) and links it to public.users + user_roles
(role='admin', scope='global'). Idempotent — safe to re-run; updates the password
if the email already exists.

Usage: python scripts/seed_admin.py <email> <password>
"""

import asyncio
import os
import sys
from uuid import UUID

import httpx
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole

GOTRUE_URL = os.environ.get("GOTRUE_URL", "http://localhost:9999")
SERVICE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0."
    "EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
)


async def upsert_auth_user(email: str, password: str) -> str:
    """Create the user in gotrue, or update password if it already exists. Returns UUID."""
    headers = {"Authorization": f"Bearer {SERVICE_KEY}"}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{GOTRUE_URL}/admin/users",
            json={"email": email, "password": password, "email_confirm": True},
            headers=headers,
        )
        if resp.status_code in (200, 201):
            return resp.json()["id"]

        if resp.status_code in (409, 422):
            # Already exists — find the user and update password
            search = await client.get(f"{GOTRUE_URL}/admin/users", headers=headers)
            search.raise_for_status()
            users = search.json().get("users", [])
            match = next((u for u in users if u.get("email") == email), None)
            if not match:
                raise RuntimeError(f"User {email} reported as existing but not found in admin list")
            user_id = match["id"]
            update = await client.put(
                f"{GOTRUE_URL}/admin/users/{user_id}",
                json={"password": password},
                headers=headers,
            )
            update.raise_for_status()
            return user_id

        raise RuntimeError(f"gotrue returned {resp.status_code}: {resp.text}")


async def main(email: str, password: str) -> None:
    print(f"→ Creating gotrue user for {email}")
    user_id_str = await upsert_auth_user(email, password)
    user_id = UUID(user_id_str)
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
