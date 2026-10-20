"""Monthly verification quota and usage-alert settings."""

import calendar
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.core.database import get_db
from app.core.plans import get_plan
from app.models import Organization, UsageDaily, utcnow
from app.services.metering import month_start, month_verifications, next_month_start
from app.schemas.dashboard import AlertsIn

router = APIRouter(prefix="/quota", tags=["Dashboard: quota"])


def _quota(db: Session, org: Organization) -> dict:
    plan = get_plan(org.plan)
    start, nxt = month_start(), next_month_start()
    used = month_verifications(db, org.id)
    now = utcnow()
    days_in_month = calendar.monthrange(start.year, start.month)[1]
    elapsed_days = max((now - datetime.combine(start, datetime.min.time(), timezone.utc)).total_seconds() / 86400, 1 / 24)
    rows = db.execute(
        select(UsageDaily.day, func.sum(UsageDaily.verifications_passed + UsageDaily.verifications_failed))
        .where(UsageDaily.org_id == org.id, UsageDaily.day >= start)
        .group_by(UsageDaily.day)
    ).all()
    by_day = {d: int(v) for d, v in rows}
    daily, running = [], 0
    for i in range((nxt - start).days):
        d = start + timedelta(days=i)
        if d > now.date():
            break
        running += by_day.get(d, 0)
        daily.append({"ts": f"{d.isoformat()}T00:00:00+00:00", "verifications": by_day.get(d, 0), "cumulative": running})
    return {
        "plan": plan,
        "quota": plan["verifications"],
        "used": used,
        "remaining": max(0, plan["verifications"] - used),
        "forecast": round(used / elapsed_days * days_in_month),
        "periodStart": f"{start.isoformat()}T00:00:00+00:00",
        "periodEnd": f"{nxt.isoformat()}T00:00:00+00:00",
        "daily": daily,
        "alerts": {"thresholds": org.alert_thresholds or [], "emails": org.alert_emails or []},
    }


@router.get("")
def get_quota(ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    return _quota(db, ctx.org)


@router.put("/alerts")
def set_alerts(body: AlertsIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("billing:write")
    org = db.get(Organization, ctx.org.id)
    org.alert_thresholds = body.thresholds
    org.alert_emails = [e.lower() for e in body.emails]
    db.commit()
    return {"thresholds": org.alert_thresholds, "emails": org.alert_emails}
