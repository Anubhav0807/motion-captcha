"""Persist labelled behavioural metrics for retraining the risk model."""

from sqlalchemy.orm import Session

from app.models import ClickMetrics, KeyboardMetrics, MouseMetrics, PredictionLabel, PredictionResults


def save_metrics_to_db(data, db: Session, label=PredictionLabel.HUMAN):
    """Persist behavioral metrics and the associated prediction."""

    try:
        click_metrics = ClickMetrics(
            average_interval=data.clicks.averageInterval,
            interval_variance=data.clicks.intervalVariance,
            total_clicks=data.clicks.totalClicks,
        )

        keyboard_metrics = KeyboardMetrics(
            average_hold_duration=data.keyboard.averageHoldDuration,
            average_interval=data.keyboard.averageInterval,
            hold_duration_variance=data.keyboard.holdDurationVariance,
            interval_variance=data.keyboard.intervalVariance,
            total_key_presses=data.keyboard.totalKeyPresses,
        )

        mouse_metrics = MouseMetrics(
            average_acceleration=data.mouse.averageAcceleration,
            average_velocity=data.mouse.averageVelocity,
            direction_changes=data.mouse.directionChanges,
            max_velocity=data.mouse.maxVelocity,
            total_distance=data.mouse.totalDistance,
            total_samples=data.mouse.totalSamples,
        )

        db.add_all([click_metrics, keyboard_metrics, mouse_metrics])

        # Populate generated IDs before creating the prediction record.
        db.flush()

        db.add(PredictionResults(
            click_metrics_id=click_metrics.id,
            keyboard_metrics_id=keyboard_metrics.id,
            mouse_metrics_id=mouse_metrics.id,
            label=label,
        ))
        db.commit()

        return {"message": "Metrics saved successfully", "prediction": label}

    except Exception:
        db.rollback()
        raise
