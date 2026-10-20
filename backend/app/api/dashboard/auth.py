"""Dashboard accounts: sign-up, sessions (HttpOnly cookie), password reset, invites."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.api.deps import PERMISSIONS, Ctx, client_ip, current
from app.core import config
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.plans import get_plan
from app.core.security import hash_password, new_token, sha256, verify_password
from app.models import Invite, Organization, PasswordReset, User, UserSession
from app.schemas.auth import AcceptInviteIn, ChangePasswordIn, ForgotIn, LoginIn, ResetIn, SignupIn
from app.services.emailer import send_email
from app.services.rate_limiter import hit

router = APIRouter(prefix="/auth", tags=["Dashboard: auth"])


def user_out(user: User, org: Organization) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "timezone": user.timezone,
        "permissions": sorted(p for p, roles in PERMISSIONS.items() if user.role in roles),
        "organization": {"id": org.id, "name": org.name, "plan": org.plan, "planName": get_plan(org.plan)["name"]},
    }


def _start_session(db: Session, user: User, request: Request, response: Response):
    token = new_token()
    db.add(UserSession(
        user_id=user.id,
        token_hash=sha256(token),
        ip=client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:300],
        expires_at=datetime.now(timezone.utc) + timedelta(days=config.SESSION_DAYS),
    ))
    db.commit()
    response.set_cookie(
        config.COOKIE_NAME,
        token,
        max_age=config.SESSION_DAYS * 86400,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def _throttle(db: Session, subject: str, limit: int = 10, window: int = 900):
    allowed, retry_after = hit(db, subject, limit, window)
    if not allowed:
        raise ApiError(429, "too_many_attempts", "Too many attempts. Try again in a few minutes.",
                       {"Retry-After": str(retry_after)})


@router.post("/signup")
def signup(body: SignupIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _throttle(db, f"signup:{client_ip(request)}", limit=5, window=3600)
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise ApiError(409, "email_taken", "An account with this email already exists.")
    org = Organization(name=body.company.strip(), billing_email=email)
    db.add(org)
    db.flush()
    user = User(org_id=org.id, email=email, name=body.name.strip(), password_hash=hash_password(body.password), role="owner")
    db.add(user)
    db.commit()
    _start_session(db, user, request, response)
    return user_out(user, org)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    _throttle(db, f"login-ip:{client_ip(request)}", limit=30)
    _throttle(db, f"login-email:{email}", limit=10)
    user = db.query(User).filter(User.email == email).first()
    if not verify_password(body.password, user.password_hash if user else None):
        raise ApiError(401, "invalid_credentials", "Incorrect email or password.")
    _start_session(db, user, request, response)
    return user_out(user, db.get(Organization, user.org_id))


@router.get("/me")
def me(ctx: Ctx = Depends(current)):
    return user_out(ctx.user, ctx.org)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(config.COOKIE_NAME)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == sha256(token)))
        db.commit()
    response.delete_cookie(config.COOKIE_NAME, path="/")


@router.post("/logout-all", status_code=204)
def logout_all(response: Response, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    db.execute(delete(UserSession).where(UserSession.user_id == ctx.user.id))
    db.commit()
    response.delete_cookie(config.COOKIE_NAME, path="/")


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, ctx.user.password_hash):
        raise ApiError(400, "invalid_password", "Your current password is incorrect.")
    user = db.get(User, ctx.user.id)
    user.password_hash = hash_password(body.new_password)
    # Sign out every other session.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.id != ctx.session.id))
    db.commit()


@router.post("/forgot-password", status_code=204)
def forgot_password(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    _throttle(db, f"forgot:{client_ip(request)}", limit=5)
    user = db.query(User).filter(User.email == body.email.lower()).first()
    # Always 204 so the endpoint can't be used to discover accounts.
    if user is None:
        return
    token = new_token()
    db.add(PasswordReset(user_id=user.id, token_hash=sha256(token),
                         expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    db.commit()
    send_email(
        user.email,
        "Reset your motion-captcha password",
        f"Someone asked to reset the password for {user.email}.\n\n"
        f"Reset it here (valid for 1 hour):\n{config.APP_URL}/reset-password?token={token}\n\n"
        "If this wasn't you, ignore this email.",
    )


@router.post("/reset-password", status_code=204)
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    reset = db.query(PasswordReset).filter(PasswordReset.token_hash == sha256(body.token)).first()
    if reset is None or reset.used_at or reset.expires_at <= datetime.now(timezone.utc):
        raise ApiError(400, "invalid_token", "This reset link is invalid or has expired.")
    user = db.get(User, reset.user_id)
    user.password_hash = hash_password(body.password)
    reset.used_at = datetime.now(timezone.utc)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()


def _valid_invite(db: Session, token: str) -> Invite:
    invite = db.query(Invite).filter(Invite.token_hash == sha256(token)).first()
    if invite is None or invite.accepted_at or invite.expires_at <= datetime.now(timezone.utc):
        raise ApiError(400, "invalid_invite", "This invitation is invalid or has expired.")
    return invite


@router.get("/invites/{token}")
def invite_info(token: str, db: Session = Depends(get_db)):
    invite = _valid_invite(db, token)
    org = db.get(Organization, invite.org_id)
    return {"email": invite.email, "role": invite.role, "organization": org.name}


@router.post("/accept-invite")
def accept_invite(body: AcceptInviteIn, request: Request, response: Response, db: Session = Depends(get_db)):
    invite = _valid_invite(db, body.token)
    if db.query(User).filter(User.email == invite.email).first():
        raise ApiError(409, "email_taken", "This email already has a motion-captcha account. Ask the inviter to use another address.")
    user = User(org_id=invite.org_id, email=invite.email, name=body.name.strip(),
                password_hash=hash_password(body.password), role=invite.role)
    invite.accepted_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    _start_session(db, user, request, response)
    return user_out(user, db.get(Organization, user.org_id))
