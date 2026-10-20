"""Request dependencies: client info, roles/permissions and dashboard session auth."""

from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.security import sha256
from app.models import Organization, User, UserSession


def client_ip(request: Request) -> str | None:
    if config.TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def request_origin_host(request: Request) -> str | None:
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin or origin == "null":
        return None
    host = urlparse(origin).hostname
    return host.lower() if host else None


def client_info(request: Request) -> dict:
    return {
        "ip": client_ip(request),
        "origin": request_origin_host(request),
        "user_agent": (request.headers.get("user-agent") or "")[:300] or None,
    }


# ------------------------------------------------------------------ roles

ROLES = ("owner", "admin", "developer", "billing", "viewer")

PERMISSIONS = {
    "keys:write": {"owner", "admin", "developer"},
    "billing:write": {"owner", "admin", "billing"},
    "billing:read": {"owner", "admin", "billing"},
    "team:write": {"owner", "admin"},
    "org:write": {"owner", "admin"},
}


class Ctx:
    def __init__(self, user: User, org: Organization, session: UserSession):
        self.user = user
        self.org = org
        self.session = session

    def can(self, permission: str) -> bool:
        return self.user.role in PERMISSIONS[permission]

    def require(self, permission: str):
        if not self.can(permission):
            raise ApiError(403, "forbidden", "Your role doesn't allow this action.")


def current(request: Request, db: Session = Depends(get_db)) -> Ctx:
    token = request.cookies.get(config.COOKIE_NAME)
    if not token:
        raise ApiError(401, "unauthenticated", "Please sign in.")
    session = db.query(UserSession).filter(UserSession.token_hash == sha256(token)).first()
    if session is None or session.expires_at <= datetime.now(timezone.utc):
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.")
    user = db.get(User, session.user_id)
    if user is None:
        raise ApiError(401, "unauthenticated", "Please sign in.")
    org = db.get(Organization, user.org_id)
    return Ctx(user, org, session)
