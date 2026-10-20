"""Team members, roles and invitations."""

from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.api.dashboard.utils import iso
from app.core import config
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.plans import get_plan
from app.core.security import new_token, sha256
from app.models import Invite, User, utcnow
from app.services.emailer import send_email
from app.schemas.dashboard import InviteIn, RoleIn

router = APIRouter(prefix="/team", tags=["Dashboard: team"])


ASSIGNABLE = {"admin", "developer", "billing", "viewer"}


@router.get("")
def team(ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.org_id == ctx.org.id).order_by(User.created_at)).all()
    invites = db.scalars(select(Invite).where(Invite.org_id == ctx.org.id, Invite.accepted_at.is_(None),
                                              Invite.expires_at > utcnow())).all()
    return {
        "members": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role, "joinedAt": iso(u.created_at),
                     "isYou": u.id == ctx.user.id} for u in users],
        "invites": [{"id": i.id, "email": i.email, "role": i.role, "createdAt": iso(i.created_at),
                     "expiresAt": iso(i.expires_at)} for i in invites],
    }


@router.post("/invites")
def invite(body: InviteIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("team:write")
    if body.role not in ASSIGNABLE:
        raise ApiError(400, "invalid_role", "Invalid role.")
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise ApiError(409, "email_taken", "That email already has a motion-captcha account.")
    plan = get_plan(ctx.org.plan)
    members = db.scalar(select(func.count()).select_from(User).where(User.org_id == ctx.org.id))
    pending = db.scalar(select(func.count()).select_from(Invite).where(
        Invite.org_id == ctx.org.id, Invite.accepted_at.is_(None), Invite.expires_at > utcnow()))
    if plan["max_members"] is not None and members + pending >= plan["max_members"]:
        raise ApiError(403, "member_limit", f"The {plan['name']} plan allows {plan['max_members']} team members.")
    token = new_token()
    inv = Invite(org_id=ctx.org.id, email=email, role=body.role, token_hash=sha256(token), invited_by=ctx.user.id,
                 expires_at=utcnow() + timedelta(days=7))
    db.add(inv)
    db.commit()
    link = f"{config.APP_URL}/accept-invite?token={token}"
    send_email(email, f"{ctx.user.name or ctx.user.email} invited you to {ctx.org.name} on motion-captcha",
               f"You've been invited to join {ctx.org.name} as {body.role}.\n\nAccept (valid 7 days):\n{link}\n")
    return {"invite": {"id": inv.id, "email": inv.email, "role": inv.role, "createdAt": iso(inv.created_at),
                       "expiresAt": iso(inv.expires_at)}, "inviteUrl": link}


@router.delete("/invites/{invite_id}", status_code=204)
def revoke_invite(invite_id: str, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("team:write")
    inv = db.get(Invite, invite_id)
    if inv is None or inv.org_id != ctx.org.id:
        raise ApiError(404, "not_found", "Invite not found.")
    db.delete(inv)
    db.commit()


def _member(db, ctx, user_id) -> User:
    u = db.get(User, user_id)
    if u is None or u.org_id != ctx.org.id:
        raise ApiError(404, "not_found", "Member not found.")
    if u.role == "owner":
        raise ApiError(409, "owner_locked", "The owner can't be changed or removed.")
    if u.id == ctx.user.id:
        raise ApiError(409, "self", "You can't change your own membership.")
    return u


@router.patch("/{user_id}")
def set_role(user_id: str, body: RoleIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("team:write")
    if body.role not in ASSIGNABLE:
        raise ApiError(400, "invalid_role", "Invalid role.")
    u = _member(db, ctx, user_id)
    u.role = body.role
    db.commit()
    return {"id": u.id, "role": u.role}


@router.delete("/{user_id}", status_code=204)
def remove_member(user_id: str, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("team:write")
    db.delete(_member(db, ctx, user_id))
    db.commit()
