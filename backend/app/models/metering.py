"""Request events, daily usage roll-ups, rate-limit windows and alert bookkeeping."""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, new_id, utcnow


class Event(Base):
    """One public API call. Retained according to the organisation's plan."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    api_key_id: Mapped[str] = mapped_column(String(36), nullable=False)
    type: Mapped[str] = mapped_column(String(12), nullable=False)        # assess | challenge | verify
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)     # ok | passed | failed | rejected | rate_limited | quota_exceeded | error
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(40))
    risk_score: Mapped[int | None] = mapped_column(Integer)
    challenge_type: Mapped[str | None] = mapped_column(String(10))
    token: Mapped[str | None] = mapped_column(String(36))
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    origin: Mapped[str | None] = mapped_column(String(255))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_events_org_created", "org_id", "created_at"),
        Index("ix_events_org_id_desc", "org_id", "id"),
    )


class UsageDaily(Base):
    """Daily per-key roll-up. Kept forever; drives usage charts and quota."""

    __tablename__ = "usage_daily"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    api_key_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)

    assessments: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    challenges_static: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    challenges_dynamic: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verifications_passed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verifications_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rate_limited: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    risk_sum: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    risk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Risk-score histogram: 0-19, 20-39, 40-59, 60-79, 80-100
    risk_b0: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    risk_b1: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    risk_b2: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    risk_b3: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    risk_b4: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (Index("ix_usage_daily_org_day", "org_id", "day"),)


class RateWindow(Base):
    """Fixed-window request counters (works across multiple API workers)."""

    __tablename__ = "rate_windows"

    subject: Mapped[str] = mapped_column(String(160), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AlertSent(Base):
    __tablename__ = "alerts_sent"

    org_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    period: Mapped[str] = mapped_column(String(7), primary_key=True)   # YYYY-MM
    threshold: Mapped[int] = mapped_column(Integer, primary_key=True)


class LimitIncreaseRequest(Base):
    __tablename__ = "limit_increase_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    api_key_id: Mapped[str | None] = mapped_column(String(36))
    requested_rpm: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="under_review")
    created_by: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
