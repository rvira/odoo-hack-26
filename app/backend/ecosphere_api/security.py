"""AuthN/AuthZ + rate limiting.

- Passwords: bcrypt (cost 12).
- Sessions: random 256-bit bearer tokens; only the SHA-256 hash is stored;
  presented tokens are re-hashed and compared with hmac.compare_digest.
- Rate limiting: in-memory sliding window (single local process by design).
"""
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta

import bcrypt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as OrmSession

from . import models
from .database import get_db

SESSION_HOURS = 12
_bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: OrmSession, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db.add(models.Session(
        user_id=user_id,
        token_hash=_token_hash(token),
        expires_at=datetime.utcnow() + timedelta(hours=SESSION_HOURS),
    ))
    db.commit()
    return token


def destroy_session(db: OrmSession, token: str) -> None:
    presented = _token_hash(token)
    for s in db.query(models.Session).all():
        if hmac.compare_digest(s.token_hash, presented):
            db.delete(s)
    db.commit()


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: OrmSession = Depends(get_db),
) -> models.User:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    presented = _token_hash(creds.credentials)
    session = (
        db.query(models.Session)
        .filter(models.Session.token_hash == presented)
        .first()
    )
    if (
        session is None
        or not hmac.compare_digest(session.token_hash, presented)
        or session.expires_at < datetime.utcnow()
    ):
        raise HTTPException(401, "Session invalid or expired")
    user = db.get(models.User, session.user_id)
    if user is None or not user.can_login:
        raise HTTPException(401, "Session invalid or expired")
    return user


def require_admin(user: models.User = Depends(current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def require_super(user: models.User = Depends(current_user)) -> models.User:
    if user.role != "super":
        raise HTTPException(403, "Super Admin access required")
    return user


def require_org_user(user: models.User = Depends(current_user)) -> models.User:
    """Org-scoped routes: Super Admin is read-scoped to the platform dashboard
    only (ARCHITECTURE.md §7) — it has no org record surface."""
    if user.org_id is None:
        raise HTTPException(403, "This view is organization-scoped")
    return user


class RateLimiter:
    """Sliding-window per-key limiter; fails closed at the limit."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] < now - self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(429, "Too many requests — slow down")
        q.append(now)


login_limiter = RateLimiter(limit=8, window_seconds=60)
write_limiter = RateLimiter(limit=180, window_seconds=60)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
