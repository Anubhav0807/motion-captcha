from fastapi import FastAPI, Depends
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import joblib
import pandas as pd

from database import engine, Base, get_db
from models import *
from schemas import MetricsRequest

from generate import generate_captcha

# Load trained ML model
risk_model = joblib.load("risk_model.joblib")


# Create all tables
Base.metadata.create_all(bind=engine)


app = FastAPI()


# Allow all origins (development only)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# Health route
# -------------------------

@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "Motion Captcha API",
        "api_base_url": "/api"
    }


# -------------------------
# GET captcha
# -------------------------

@app.get("/api/captcha")
def get_captcha():
    image_path = generate_captcha()

    return FileResponse(
        path=image_path,
        media_type="image/gif",
        filename="capthca.gif",
        content_disposition_type="inline",
        headers={"Cache-Control": "no-store"}
    )


# -------------------------
# POST metrics
# -------------------------

@app.post("/api/metrics")
def analyze_risk(
    data: MetricsRequest,
):
    # Create feature dictionary in the exact order/names
    # used during training
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

    # Put features into DataFrame
    X = pd.DataFrame(
        [features],
        columns=risk_model["features"]
    )

    # CatBoost probability of BOT
    catboost_probability = (
        risk_model["catboost"]
        .predict_proba(X)[0][1]
    )

    # TabPFN probability of BOT
    tabpfn_probability = (
        risk_model["tabpfn"]
        .predict_proba(X)[0][1]
    )

    # Ensemble probability
    probability = (
        risk_model["catboost_weight"]
        * catboost_probability
        +
        risk_model["tabpfn_weight"]
        * tabpfn_probability
    )

    # Convert 0-1 probability to 0-100 risk score
    risk_score = round(probability * 100)

    # Make sure it is always within 0-100
    risk_score = max(0, min(100, risk_score))

    return {
        "risk_score": risk_score
    }

@app.post("/api/save-metrics")
def save_metrics(
    data: MetricsRequest,
    db: Session = Depends(get_db)
):

    # Click metrics
    click_metrics = ClickMetrics(
        average_interval=data.clicks.averageInterval,
        interval_variance=data.clicks.intervalVariance,
        total_clicks=data.clicks.totalClicks
    )

    # Keyboard metrics
    keyboard_metrics = KeyboardMetrics(
        average_hold_duration=data.keyboard.averageHoldDuration,
        average_interval=data.keyboard.averageInterval,
        hold_duration_variance=data.keyboard.holdDurationVariance,
        interval_variance=data.keyboard.intervalVariance,
        total_key_presses=data.keyboard.totalKeyPresses
    )

    # Mouse metrics
    mouse_metrics = MouseMetrics(
        average_acceleration=data.mouse.averageAcceleration,
        average_velocity=data.mouse.averageVelocity,
        direction_changes=data.mouse.directionChanges,
        max_velocity=data.mouse.maxVelocity,
        total_distance=data.mouse.totalDistance,
        total_samples=data.mouse.totalSamples
    )

    # Add metrics
    db.add(click_metrics)
    db.add(keyboard_metrics)
    db.add(mouse_metrics)

    # Generate IDs before creating PredictionResult
    db.flush()

    # Prediction result
    prediction_result = PredictionResults(
        click_metrics_id=click_metrics.id,
        keyboard_metrics_id=keyboard_metrics.id,
        mouse_metrics_id=mouse_metrics.id,
        label=PredictionLabel.HUMAN
    )

    db.add(prediction_result)

    # Save everything
    db.commit()

    return {
        "message": "Metrics saved successfully",
        "prediction": PredictionLabel.HUMAN
    }