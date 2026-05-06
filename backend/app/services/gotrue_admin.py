"""Helpers for talking to gotrue's admin API.

Used by the bootstrap admin seeder and the demo seeder to create real
Supabase auth users (so each role has a working login).
"""

import os
from uuid import UUID

import httpx

GOTRUE_URL = os.environ.get("GOTRUE_URL", "http://localhost:9999")
SERVICE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0."
    "EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
)
HEADERS = {"Authorization": f"Bearer {SERVICE_KEY}"}


async def _find_user_by_email(client: httpx.AsyncClient, email: str) -> dict | None:
    """Page through gotrue admin/users until we find the email, or exhaust."""
    page = 1
    per_page = 200
    while True:
        resp = await client.get(
            f"{GOTRUE_URL}/admin/users",
            params={"page": page, "per_page": per_page},
            headers=HEADERS,
        )
        resp.raise_for_status()
        users = resp.json().get("users", [])
        if not users:
            return None
        for u in users:
            if u.get("email") == email:
                return u
        if len(users) < per_page:
            return None
        page += 1


async def upsert_auth_user(email: str, password: str) -> UUID:
    """Create the user in gotrue, or update password if it already exists. Returns UUID."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{GOTRUE_URL}/admin/users",
            json={"email": email, "password": password, "email_confirm": True},
            headers=HEADERS,
        )
        if resp.status_code in (200, 201):
            return UUID(resp.json()["id"])

        if resp.status_code in (409, 422):
            match = await _find_user_by_email(client, email)
            if not match:
                raise RuntimeError(
                    f"User {email} reported as existing but not found in admin list"
                )
            user_id = UUID(match["id"])
            update = await client.put(
                f"{GOTRUE_URL}/admin/users/{user_id}",
                json={"password": password},
                headers=HEADERS,
            )
            update.raise_for_status()
            return user_id

        raise RuntimeError(f"gotrue returned {resp.status_code}: {resp.text}")
