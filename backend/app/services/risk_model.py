"""Bot-risk scoring with the trained CatBoost + TabPFN ensemble (see ml/train.py)."""

import logging
import threading

import joblib
import pandas as pd

from app.core import config

logger = logging.getLogger("motion_captcha.model")

_model = None
_load_lock = threading.Lock()
# CatBoost / TabPFN inference is not guaranteed to be thread-safe.
_predict_lock = threading.Lock()


def load_model():
    """Load the model once. Called at API start-up so a missing file fails fast."""
    global _model
    with _load_lock:
        if _model is None:
            logger.info("Loading risk model from %s", config.MODEL_PATH)
            _model = joblib.load(config.MODEL_PATH)
    return _model


def features_from(data) -> dict:
    """Map the public API's metrics payload to the model's feature names."""
    return {
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


def calculate_risk_score(data) -> int:
    """Calculate a bot-risk score between 0 and 100."""
    risk_model = load_model()

    X = pd.DataFrame([features_from(data)], columns=risk_model["features"])

    with _predict_lock:
        # Probability of BOT from each model
        catboost_probability = risk_model["catboost"].predict_proba(X)[0][1]
        tabpfn_probability = risk_model["tabpfn"].predict_proba(X)[0][1]

    # Weighted ensemble probability
    probability = (
        risk_model["catboost_weight"] * catboost_probability
        + risk_model["tabpfn_weight"] * tabpfn_probability
    )

    return int(max(0, min(100, round(probability * 100))))
