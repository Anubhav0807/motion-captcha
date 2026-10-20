"""Metering: one Event row per public API call plus a daily per-key roll-up (UsageDaily)."""

import time
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ApiKey, Event, UsageDaily


def month_start(today: date | None = None) -> date:
    today = today or datetime.now(timezone.utc).date()
    return today.replace(day=1)


def next_month_start(today: date | None = None) -> date:
    start = month_start(today)
    return date(start.year + (start.month == 12), start.month % 12 + 1, 1)


def month_verifications(db: Session, org_id: str) -> int:
    total = db.execute(
        select(func.coalesce(func.sum(UsageDaily.verifications_passed + UsageDaily.verifications_failed), 0))
        .where(UsageDaily.org_id == org_id, UsageDaily.day >= month_start())
    ).scalar_one()
    return int(total)


def _risk_bucket(score: int) -> str:
    return f"risk_b{min(4, max(0, score) // 20)}"


def record_event(
    db: Session,
    key: ApiKey,
    *,
    type: str,
    outcome: str,
    status_code: int,
    started: float,
    client: dict,
    risk_score: int | None = None,
    challenge_type: str | None = None,
    error_code: str | None = None,
    token: str | None = None,
):
    """Persist one public API call and update the daily roll-up in the same transaction."""
    now = datetime.now(timezone.utc)
    db.add(Event(
        org_id=key.org_id,
        api_key_id=key.id,
        type=type,
        outcome=outcome,
        status_code=status_code,
        error_code=error_code,
        risk_score=risk_score,
        challenge_type=challenge_type,
        token=token,
        latency_ms=int((time.perf_counter() - started) * 1000),
        origin=client.get("origin"),
        ip=client.get("ip"),
        user_agent=client.get("user_agent"),
        created_at=now,
    ))

    inc = {}
    if outcome == "rate_limited":
        inc["rate_limited"] = 1
    elif outcome in ("error",):
        inc["errors"] = 1
    elif type == "assess" and outcome == "ok":
        inc["assessments"] = 1
        if risk_score is not None:
            inc["risk_sum"] = risk_score
            inc["risk_count"] = 1
            inc[_risk_bucket(risk_score)] = 1
    elif type == "challenge" and outcome == "ok":
        inc["challenges_dynamic" if challenge_type == "dynamic" else "challenges_static"] = 1
    elif type == "verify" and outcome == "passed":
        inc["verifications_passed"] = 1
    elif type == "verify" and outcome == "failed":
        inc["verifications_failed"] = 1

    if inc:
        stmt = pg_insert(UsageDaily).values(day=now.date(), api_key_id=key.id, org_id=key.org_id, **inc)
        stmt = stmt.on_conflict_do_update(
            index_elements=[UsageDaily.day, UsageDaily.api_key_id],
            set_={col: getattr(UsageDaily, col) + stmt.excluded[col] for col in inc},
        )
        db.execute(stmt)

    if outcome in ("ok", "passed", "failed"):
        key.last_used_at = now

    db.commit()
