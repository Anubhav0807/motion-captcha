"""Fixed-window rate limiting stored in Postgres, so limits hold across API workers."""

from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import RateWindow


def window_start(now: datetime, window_seconds: int) -> datetime:
    epoch = int(now.timestamp())
    return datetime.fromtimestamp(epoch - epoch % window_seconds, tz=timezone.utc)


def hit(db: Session, subject: str, limit: int, window_seconds: int = 60):
    """Count one request. Returns (allowed, retry_after_seconds)."""
    now = datetime.now(timezone.utc)
    start = window_start(now, window_seconds)

    stmt = (
        pg_insert(RateWindow)
        .values(subject=subject, window_start=start, count=1)
        .on_conflict_do_update(
            index_elements=[RateWindow.subject, RateWindow.window_start],
            set_={"count": RateWindow.count + 1},
        )
        .returning(RateWindow.count)
    )
    count = db.execute(stmt).scalar_one()
    db.commit()

    retry_after = max(1, int(start.timestamp()) + window_seconds - int(now.timestamp()))
    return count <= limit, retry_after
