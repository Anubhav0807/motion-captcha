"""State of a single CAPTCHA flow: risk assessment, then the issued challenge."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, new_id, utcnow


class Assessment(Base):
    """A bot-risk assessment. Its token identifies the whole CAPTCHA flow."""

    __tablename__ = "assessments"

    token: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    api_key_id: Mapped[str] = mapped_column(ForeignKey("api_keys.id", ondelete="CASCADE"), index=True)
    org_id: Mapped[str] = mapped_column(String(36), index=True)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    challenge_type: Mapped[str] = mapped_column(String(10), nullable=False)
    origin: Mapped[str | None] = mapped_column(String(255))
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class Challenge(Base):
    __tablename__ = "challenges"

    token: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("assessments.token", ondelete="CASCADE"),
        primary_key=True,
    )
    answer_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    refreshes: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
