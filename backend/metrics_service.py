from pathlib import Path

import joblib
import pandas as pd
from sqlalchemy.orm import Session

from schemas import RiskScoreData

from models import (
    ClickMetrics,
    KeyboardMetrics,
    MouseMetrics,
    PredictionResults,
    PredictionLabel,
    RiskScoreRecord
)


# Load the trained ensemble once
MODEL_PATH = Path(__file__).resolve().parent / "risk_model.joblib"
risk_model = joblib.load(MODEL_PATH)


def calculate_risk_score(data, db: Session) -> RiskScoreData:
    """Calculate a bot-risk score between 0 and 100."""

    features = {
        "click_average_interval": data.clicks.averageInterval,
        "click_interval_variance": data.clicks.intervalVariance,
        "total_clicks": data.clicks.totalClicks,

        "average_hold_duration": data.keyboard.averageHoldDuration,
        "keyboard_average_interval": data.keyboard.averageInterval,
        "hold_duration_variance": data.keyboard.holdDurationVariance,
        "keyboard_interval_variance": data.keyboard.intervalVariance,
        "total_key_presses": data.keyboard.totalKeyPresses,

        "average_acceleration": data.mouse.averageAcceleration,
        "average_velocity": data.mouse.averageVelocity,
        "direction_changes": data.mouse.directionChanges,
        "max_velocity": data.mouse.maxVelocity,
        "total_distance": data.mouse.totalDistance,
        "total_samples": data.mouse.totalSamples,
    }

    X = pd.DataFrame(
        [features],
        columns=risk_model["features"],
    )

    # CatBoost probability of BOT
    catboost_probability = (
        risk_model["catboost"].predict_proba(X)[0][1]
    )

    # TabPFN probability of BOT
    tabpfn_probability = (
        risk_model["tabpfn"].predict_proba(X)[0][1]
    )

    # Weighted ensemble probability
    probability = (
        risk_model["catboost_weight"] * catboost_probability
        + risk_model["tabpfn_weight"] * tabpfn_probability
    )

    risk_score = max(0, min(100, round(probability * 100)))
    record = RiskScoreRecord(risk_score=risk_score)

    try:
        db.add(record)
        db.commit()
        db.refresh(record)

        return record

    except Exception:
        db.rollback()
        raise


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

        db.add_all([
            click_metrics,
            keyboard_metrics,
            mouse_metrics,
        ])

        # Populate generated IDs before creating the prediction record.
        db.flush()

        prediction_result = PredictionResults(
            click_metrics_id=click_metrics.id,
            keyboard_metrics_id=keyboard_metrics.id,
            mouse_metrics_id=mouse_metrics.id,
            label=label,
        )

        db.add(prediction_result)
        db.commit()

        return {
            "message": "Metrics saved successfully",
            "prediction": label,
        }

    except Exception:
        db.rollback()
        raise
