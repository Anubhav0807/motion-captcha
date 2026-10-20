"""Per-key rate limits, today's peaks and limit-increase requests."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.api.dashboard.utils import DAY, iso
from app.core import config
from app.core.database import get_db
from app.core.plans import PLANS, PLAN_ORDER, get_plan
from app.models import ApiKey, Event, LimitIncreaseRequest, RateWindow, utcnow
from app.services.emailer import send_email
from app.schemas.dashboard import IncreaseIn
from app.api.dashboard.keys import get_own_key

router = APIRouter(prefix="/rate-limits", tags=["Dashboard: rate limits"])


ENDPOINTS = ["assess", "challenge", "verify"]


@router.get("")
def rate_limits(ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    plan = get_plan(ctx.org.plan)
    keys = db.scalars(select(ApiKey).where(ApiKey.org_id == ctx.org.id, ApiKey.status == "active")
                      .order_by(ApiKey.created_at)).all()
    today = datetime.combine(utcnow().date(), datetime.min.time(), timezone.utc)
    since = utcnow() - DAY

    peaks = {}
    if keys:
        subjects = [f"key:{k.id}:{e}" for k in keys for e in ENDPOINTS]
        peaks = dict(db.execute(
            select(RateWindow.subject, func.max(RateWindow.count))
            .where(RateWindow.subject.in_(subjects), RateWindow.window_start >= today)
            .group_by(RateWindow.subject)
        ).all())
    throttled = {
        (k, t): n for k, t, n in db.execute(
            select(Event.api_key_id, Event.type, func.count())
            .where(Event.org_id == ctx.org.id, Event.outcome == "rate_limited", Event.created_at >= since)
            .group_by(Event.api_key_id, Event.type)
        ).all()
    }
    requests = db.scalars(select(LimitIncreaseRequest).where(LimitIncreaseRequest.org_id == ctx.org.id)
                          .order_by(LimitIncreaseRequest.created_at.desc())).all()
    return {
        "plan": plan,
        "plans": [PLANS[p] for p in PLAN_ORDER],
        "keys": [
            {
                "keyId": k.id,
                "name": k.name,
                "limit": k.rpm_override or plan["rpm"],
                "custom": k.rpm_override is not None,
                "endpoints": [
                    {"endpoint": e, "peak": int(peaks.get(f"key:{k.id}:{e}", 0)), "throttled24h": int(throttled.get((k.id, e), 0))}
                    for e in ENDPOINTS
                ],
            }
            for k in keys
        ],
        "requests": [
            {"id": r.id, "keyId": r.api_key_id, "requestedRpm": r.requested_rpm, "reason": r.reason,
             "status": r.status, "createdAt": iso(r.created_at)}
            for r in requests
        ],
    }


@router.post("/increase-requests")
def request_increase(body: IncreaseIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("keys:write")
    if body.keyId:
        get_own_key(db, ctx, body.keyId)
    r = LimitIncreaseRequest(org_id=ctx.org.id, api_key_id=body.keyId, requested_rpm=body.requestedRpm,
                             reason=body.reason, created_by=ctx.user.id)
    db.add(r)
    db.commit()
    if config.SUPPORT_EMAIL:
        send_email(config.SUPPORT_EMAIL, f"Rate limit increase request: {ctx.org.name}",
                   f"Org: {ctx.org.name} ({ctx.org.id}), plan {ctx.org.plan}\nKey: {body.keyId or 'all keys'}\n"
                   f"Requested: {body.requestedRpm} rpm\nFrom: {ctx.user.email}\n\n{body.reason}")
    return {"id": r.id, "status": r.status}
