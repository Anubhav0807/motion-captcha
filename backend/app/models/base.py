import uuid
from datetime import datetime, timezone

from app.core.database import Base

__all__ = ["Base", "new_id", "utcnow"]


def utcnow():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid.uuid4())
