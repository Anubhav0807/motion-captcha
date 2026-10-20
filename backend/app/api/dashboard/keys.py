"""API keys: create, edit, roll the secret, revoke, delete."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.api.dashboard.utils import iso
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.plans import get_plan
from app.core.security import new_secret_key, new_site_key, sha256
from app.models import ApiKey, utcnow
from app.services.notifications import notify
from app.schemas.keys import KeyIn, KeyPatch, KeySettings

router = APIRouter(prefix="/keys", tags=["Dashboard: keys"])


def key_out(k: ApiKey) -> dict:
    return {
        "id": k.id,
        "name": k.name,
        "siteKey": k.site_key,
        "secretLast4": k.secret_last4,
        "status": k.status,
        "allowedDomains": k.allowed_domains or [],
        "settings": {
            "uppercase": k.uppercase,
            "lowercase": k.lowercase,
            "numbers": k.numbers,
            "length": k.length,
            "dynamicThreshold": k.dynamic_threshold,
            "caseSensitive": k.case_sensitive,
            "challengeTtl": k.challenge_ttl,
        },
        "rpmOverride": k.rpm_override,
        "createdAt": iso(k.created_at),
        "secretRotatedAt": iso(k.secret_rotated_at),
        "revokedAt": iso(k.revoked_at),
        "lastUsedAt": iso(k.last_used_at),
    }


def _apply_settings(k: ApiKey, s: KeySettings):
    if not (s.uppercase or s.lowercase or s.numbers):
        raise ApiError(400, "invalid_settings", "Enable at least one character set.")
    k.uppercase, k.lowercase, k.numbers = s.uppercase, s.lowercase, s.numbers
    k.length, k.dynamic_threshold = s.length, s.dynamicThreshold
    k.case_sensitive, k.challenge_ttl = s.caseSensitive, s.challengeTtl


def get_own_key(db: Session, ctx: Ctx, key_id: str) -> ApiKey:
    k = db.get(ApiKey, key_id)
    if k is None or k.org_id != ctx.org.id:
        raise ApiError(404, "not_found", "Key not found.")
    return k


@router.get("")
def list_keys(status: str | None = None, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    q = select(ApiKey).where(ApiKey.org_id == ctx.org.id)
    if status:
        q = q.where(ApiKey.status == status)
    return [key_out(k) for k in db.scalars(q.order_by(ApiKey.created_at.desc())).all()]


@router.post("")
def create_key(body: KeyIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("keys:write")
    plan = get_plan(ctx.org.plan)
    active = db.scalar(select(func.count()).select_from(ApiKey).where(ApiKey.org_id == ctx.org.id, ApiKey.status == "active"))
    if plan["max_keys"] is not None and active >= plan["max_keys"]:
        raise ApiError(403, "key_limit", f"The {plan['name']} plan allows {plan['max_keys']} active keys. Upgrade or revoke a key.")
    secret = new_secret_key()
    k = ApiKey(
        org_id=ctx.org.id, name=body.name.strip(), site_key=new_site_key(),
        secret_hash=sha256(secret), secret_last4=secret[-4:], allowed_domains=body.allowedDomains,
        created_by=ctx.user.id,
    )
    _apply_settings(k, body.settings)
    db.add(k)
    db.commit()
    notify(db, ctx.org.id, "API key created", f"{ctx.user.name or ctx.user.email} created the key “{k.name}”.", "info", "keyEvents")
    return {"key": key_out(k), "secret": secret}


@router.patch("/{key_id}")
def update_key(key_id: str, body: KeyPatch, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("keys:write")
    k = get_own_key(db, ctx, key_id)
    if body.name is not None:
        k.name = body.name.strip()
    if body.allowedDomains is not None:
        k.allowed_domains = body.allowedDomains
    if body.settings is not None:
        _apply_settings(k, body.settings)
    db.commit()
    return key_out(k)


@router.post("/{key_id}/roll-secret")
def roll_secret(key_id: str, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("keys:write")
    k = get_own_key(db, ctx, key_id)
    if k.status != "active":
        raise ApiError(409, "key_revoked", "Revoked keys can't be rolled.")
    secret = new_secret_key()
    k.secret_hash, k.secret_last4, k.secret_rotated_at = sha256(secret), secret[-4:], utcnow()
    db.commit()
    notify(db, ctx.org.id, "Secret key rolled", f"The secret for “{k.name}” was replaced by {ctx.user.email}. The old secret no longer works.", "warn", "keyEvents")
    return {"key": key_out(k), "secret": secret}


@router.post("/{key_id}/revoke")
def revoke_key(key_id: str, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("keys:write")
    k = get_own_key(db, ctx, key_id)
    if k.status == "active":
        k.status, k.revoked_at = "revoked", utcnow()
        db.commit()
        notify(db, ctx.org.id, "API key revoked", f"{ctx.user.email} revoked “{k.name}”.", "warn", "keyEvents")
    return key_out(k)


@router.delete("/{key_id}", status_code=204)
def delete_key(key_id: str, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("keys:write")
    k = get_own_key(db, ctx, key_id)
    if k.status == "active":
        raise ApiError(409, "key_active", "Revoke the key before deleting it.")
    db.delete(k)
    db.commit()
