"""Profile, notification preferences and organisation settings."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.core.database import get_db
from app.models import Organization, User
from app.schemas.dashboard import SettingsIn

router = APIRouter(prefix="/settings", tags=["Dashboard: settings"])


def settings_out(user: User, org: Organization) -> dict:
    return {
        "profile": {"name": user.name, "email": user.email, "timezone": user.timezone},
        "notifications": user.notification_prefs or {},
        "organization": {"id": org.id, "name": org.name, "billingEmail": org.billing_email},
    }


@router.get("")
def get_settings(ctx: Ctx = Depends(current)):
    return settings_out(ctx.user, ctx.org)


@router.patch("")
def update_settings(body: SettingsIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    user = db.get(User, ctx.user.id)
    org = db.get(Organization, ctx.org.id)
    if body.name is not None:
        user.name = body.name.strip()
    if body.timezone is not None:
        user.timezone = body.timezone
    if body.notifications is not None:
        allowed = {"usageAlerts", "keyEvents", "billing", "productUpdates"}
        user.notification_prefs = {**(user.notification_prefs or {}),
                                   **{k: v for k, v in body.notifications.items() if k in allowed}}
    if body.organizationName is not None:
        ctx.require("org:write")
        org.name = body.organizationName.strip()
    if body.billingEmail is not None:
        ctx.require("billing:write")
        org.billing_email = body.billingEmail.lower()
    db.commit()
    return settings_out(user, org)
