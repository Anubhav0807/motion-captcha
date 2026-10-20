"""Hourly clean-up of expired data. Safe to run concurrently from several workers."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.core.plans import PLANS
from app.models import Assessment, Event, Invite, Organization, PasswordReset, RateWindow, UserSession, utcnow

logger = logging.getLogger("motion_captcha.maintenance")

INTERVAL_SECONDS = 3600


def run_maintenance():
    db = SessionLocal()
    try:
        now = utcnow()
        # Request logs: keep as long as each organisation's plan allows.
        for plan_id, plan in PLANS.items():
            org_ids = select(Organization.id).where(Organization.plan == plan_id)
            db.execute(delete(Event).where(
                Event.org_id.in_(org_ids),
                Event.created_at < now - timedelta(days=plan["retention_days"]),
            ))
        db.execute(delete(Assessment).where(Assessment.expires_at < now - timedelta(days=1)))
        db.execute(delete(RateWindow).where(RateWindow.window_start < now - timedelta(days=2)))
        db.execute(delete(UserSession).where(UserSession.expires_at < now))
        db.execute(delete(PasswordReset).where(PasswordReset.expires_at < now - timedelta(days=1)))
        db.execute(delete(Invite).where(Invite.accepted_at.is_(None), Invite.expires_at < now - timedelta(days=30)))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Maintenance failed")
    finally:
        db.close()


async def maintenance_loop():
    while True:
        await asyncio.to_thread(run_maintenance)
        await asyncio.sleep(INTERVAL_SECONDS)
