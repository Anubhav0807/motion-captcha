from enum import Enum

from sqlalchemy import Float, Integer, Enum as SQLEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class PredictionLabel(str, Enum):
    HUMAN = "human"
    BOT = "bot"


class ClickMetrics(Base):
    __tablename__ = "click_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)

    average_interval: Mapped[float] = mapped_column(Float)
    interval_variance: Mapped[float] = mapped_column(Float)
    total_clicks: Mapped[int] = mapped_column(Integer)


class KeyboardMetrics(Base):
    __tablename__ = "keyboard_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)

    average_hold_duration: Mapped[float] = mapped_column(Float)
    average_interval: Mapped[float] = mapped_column(Float)
    hold_duration_variance: Mapped[float] = mapped_column(Float)
    interval_variance: Mapped[float] = mapped_column(Float)
    total_key_presses: Mapped[int] = mapped_column(Integer)


class MouseMetrics(Base):
    __tablename__ = "mouse_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)

    average_acceleration: Mapped[float] = mapped_column(Float)
    average_velocity: Mapped[float] = mapped_column(Float)
    direction_changes: Mapped[int] = mapped_column(Integer)
    max_velocity: Mapped[float] = mapped_column(Float)
    total_distance: Mapped[float] = mapped_column(Float)
    total_samples: Mapped[int] = mapped_column(Integer)


class PredictionResults(Base):
    __tablename__ = "prediction_results"

    id: Mapped[int] = mapped_column(primary_key=True)

    click_metrics_id: Mapped[int] = mapped_column(
        ForeignKey("click_metrics.id"),
        nullable=False
    )

    keyboard_metrics_id: Mapped[int] = mapped_column(
        ForeignKey("keyboard_metrics.id"),
        nullable=False
    )

    mouse_metrics_id: Mapped[int] = mapped_column(
        ForeignKey("mouse_metrics.id"),
        nullable=False
    )

    label: Mapped[PredictionLabel] = mapped_column(
        SQLEnum(PredictionLabel),
        nullable=False
    )