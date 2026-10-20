"""Request logs (the Event table), filtered and cursor-paginated."""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.api.dashboard.utils import iso
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.plans import get_plan
from app.models import Event, utcnow

router = APIRouter(prefix="/logs", tags=["Dashboard: logs"])


def event_out(e: Event) -> dict:
    return {
        "id": str(e.id), "timestamp": iso(e.created_at), "type": e.type, "outcome": e.outcome,
        "statusCode": e.status_code, "errorCode": e.error_code, "riskScore": e.risk_score,
        "challengeType": e.challenge_type, "token": e.token, "keyId": e.api_key_id,
        "latencyMs": e.latency_ms, "origin": e.origin, "ip": e.ip, "userAgent": e.user_agent,
    }


@router.get("")
def list_logs(
    cursor: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    type: str | None = None,
    outcome: str | None = None,
    keyId: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    ctx: Ctx = Depends(current),
    db: Session = Depends(get_db),
):
    retention = get_plan(ctx.org.plan)["retention_days"]
    cond = [Event.org_id == ctx.org.id, Event.created_at >= utcnow() - timedelta(days=retention)]
    if type:
        cond.append(Event.type == type)
    if outcome == "success":
        cond.append(Event.outcome.in_(["ok", "passed"]))
    elif outcome == "failure":
        cond.append(Event.outcome.notin_(["ok", "passed"]))
    elif outcome:
        cond.append(Event.outcome == outcome)
    if keyId:
        cond.append(Event.api_key_id == keyId)
    if q:
        like = f"{q.strip()}%"
        cond.append(or_(Event.token.like(like), Event.ip.like(like), Event.origin.like(like), Event.error_code.like(like)))
    if cursor:
        cond.append(Event.id < cursor)
    rows = db.scalars(select(Event).where(*cond).order_by(Event.id.desc()).limit(limit + 1)).all()
    items = rows[:limit]
    return {
        "items": [event_out(e) for e in items],
        "nextCursor": str(items[-1].id) if len(rows) > limit else None,
        "retentionDays": retention,
    }


@router.get("/{event_id}")
def get_log(event_id: int, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    e = db.get(Event, event_id)
    if e is None or e.org_id != ctx.org.id:
        raise ApiError(404, "not_found", "Log entry not found.")
    related = []
    if e.token:
        related = [event_out(x) for x in db.scalars(
            select(Event).where(Event.org_id == ctx.org.id, Event.token == e.token).order_by(Event.id)).all()]
    return {**event_out(e), "flow": related}
