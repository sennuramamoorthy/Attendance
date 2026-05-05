import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings


def generate_session_secret() -> str:
    return secrets.token_hex(32)


def generate_qr_token(session_id: str, rotation_index: int, secret: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sessionId": session_id,
        "rotationIndex": rotation_index,
        "iat": now,
        "exp": now + timedelta(seconds=settings.qr_token_ttl_seconds),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_qr_token(token: str, secret: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
