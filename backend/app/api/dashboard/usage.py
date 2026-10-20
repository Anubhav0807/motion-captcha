"""Usage analytics: time series and per-key breakdown."""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.api.dashboard.utils import DAY, iso, parse_dt
from app.core.database import get_db
from app.core.errors import ApiError
from app.models import Event, UsageDaily, utcnow

router = APIRouter(prefix="/usage", tags=["Dashboard: analytics"])


USAGE_COLS = [
    "assessments", "challenges_static", "challenges_dynamic", "verifications_passed",
    "verifications_failed", "errors", "rate_limited", "risk_sum", "risk_count",
]
BUCKETS = ["risk_b0", "risk_b1", "risk_b2", "risk_b3", "risk_b4"]
CAMEL = {
    "assessments": "assessments", "challenges_static": "challengesStatic", "challenges_dynamic": "challengesDynamic",
    "verifications_passed": "passed", "verifications_failed": "failed", "errors": "errors",
    "rate_limited": "rateLimited", "risk_sum": "riskSum", "risk_count": "riskCount",
}


def _empty_point(ts):
    return {"ts": ts, **{c: 0 for c in CAMEL.values()}}


def _hourly_rows(db, org_id, start, end, key_id):
    ok_assess = and_(Event.type == "assess", Event.outcome == "ok")
    ok_challenge = and_(Event.type == "challenge", Event.outcome == "ok")
    bucket = func.date_trunc("hour", Event.created_at).label("bucket")
    cond = [Event.org_id == org_id, Event.created_at >= start, Event.created_at <= end]
    if key_id:
        cond.append(Event.api_key_id == key_id)
    stmt = select(
        bucket,
        func.count().filter(ok_assess).label("assessments"),
        func.count().filter(and_(ok_challenge, Event.challenge_type == "static")).label("challenges_static"),
        func.count().filter(and_(ok_challenge, Event.challenge_type == "dynamic")).label("challenges_dynamic"),
        func.count().filter(and_(Event.type == "verify", Event.outcome == "passed")).label("verifications_passed"),
        func.count().filter(and_(Event.type == "verify", Event.outcome == "failed")).label("verifications_failed"),
        func.count().filter(Event.outcome == "error").label("errors"),
        func.count().filter(Event.outcome == "rate_limited").label("rate_limited"),
        func.coalesce(func.sum(Event.risk_score).filter(ok_assess), 0).label("risk_sum"),
        func.count(Event.risk_score).filter(ok_assess).label("risk_count"),
        *[
            func.count().filter(and_(ok_assess, Event.risk_score >= i * 20, Event.risk_score < (i + 1) * 20 + (i == 4))).label(b)
            for i, b in enumerate(BUCKETS)
        ],
    ).where(*cond).group_by(bucket)
    return db.execute(stmt).mappings().all()


@router.get("/timeseries")
def usage_timeseries(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    granularity: str = "day",
    keyId: str | None = None,
    ctx: Ctx = Depends(current),
    db: Session = Depends(get_db),
):
    end = parse_dt(to, utcnow())
    start = parse_dt(from_, end - timedelta(days=30))
    if end - start > timedelta(days=400):
        raise ApiError(400, "range_too_large", "Choose a range of at most 400 days.")

    points, buckets = [], [0] * 5

    if granularity == "hour":
        if end - start > timedelta(days=7):
            raise ApiError(400, "range_too_large", "Hourly data is available for ranges up to 7 days.")
        rows = {r["bucket"]: r for r in _hourly_rows(db, ctx.org.id, start, end, keyId)}
        t = start.replace(minute=0, second=0, microsecond=0)
        while t <= end:
            p = _empty_point(iso(t))
            r = rows.get(t)
            if r:
                for col, name in CAMEL.items():
                    p[name] = int(r[col])
                for i, b in enumerate(BUCKETS):
                    buckets[i] += int(r[b])
            points.append(p)
            t += timedelta(hours=1)
    else:
        cond = [UsageDaily.org_id == ctx.org.id, UsageDaily.day >= start.date(), UsageDaily.day <= end.date()]
        if keyId:
            cond.append(UsageDaily.api_key_id == keyId)
        stmt = (
            select(UsageDaily.day, *[func.sum(getattr(UsageDaily, c)).label(c) for c in USAGE_COLS + BUCKETS])
            .where(*cond)
            .group_by(UsageDaily.day)
        )
        rows = {r["day"]: r for r in db.execute(stmt).mappings().all()}
        d = start.date()
        while d <= end.date():
            p = _empty_point(f"{d.isoformat()}T00:00:00+00:00")
            r = rows.get(d)
            if r:
                for col, name in CAMEL.items():
                    p[name] = int(r[col] or 0)
                for i, b in enumerate(BUCKETS):
                    buckets[i] += int(r[b] or 0)
            points.append(p)
            d += DAY

    totals = {name: sum(p[name] for p in points) for name in CAMEL.values()}
    totals["riskBuckets"] = buckets
    return {"granularity": "hour" if granularity == "hour" else "day", "from": iso(start), "to": iso(end),
            "points": points, "totals": totals}


@router.get("/by-key")
def usage_by_key(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    ctx: Ctx = Depends(current),
    db: Session = Depends(get_db),
):
    end = parse_dt(to, utcnow())
    start = parse_dt(from_, end - timedelta(days=30))
    stmt = (
        select(UsageDaily.api_key_id, *[func.sum(getattr(UsageDaily, c)).label(c) for c in USAGE_COLS])
        .where(UsageDaily.org_id == ctx.org.id, UsageDaily.day >= start.date(), UsageDaily.day <= end.date())
        .group_by(UsageDaily.api_key_id)
    )
    items = [
        {"keyId": r["api_key_id"], **{CAMEL[c]: int(r[c] or 0) for c in USAGE_COLS}}
        for r in db.execute(stmt).mappings().all()
    ]
    return sorted(items, key=lambda i: -(i["passed"] + i["failed"]))
