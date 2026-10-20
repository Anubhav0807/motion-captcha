from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, new_id, utcnow


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    # Public key used by the browser widget.
    site_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # Secret key used by the customer's server; only a SHA-256 hash is stored.
    secret_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    secret_last4: Mapped[str] = mapped_column(String(4), nullable=False)

    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active")
    allowed_domains: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # CAPTCHA settings
    uppercase: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    lowercase: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    numbers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    length: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    dynamic_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    case_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    challenge_ttl: Mapped[int] = mapped_column(Integer, nullable=False, default=120)

    rpm_override: Mapped[int | None] = mapped_column(Integer)

    created_by: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    secret_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
