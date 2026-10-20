"""Small helpers shared by the dashboard routes."""

from datetime import datetime, timedelta, timezone

from app.core.errors import ApiError

DAY = timedelta(days=1)


def iso(dt):
    return dt.isoformat() if dt else None


def parse_dt(value: str | None, default: datetime) -> datetime:
    if not value:
        return default
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(400, "invalid_date", f"Invalid date: {value}")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
