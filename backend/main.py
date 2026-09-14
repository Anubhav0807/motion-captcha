from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import ClickMetrics, KeyboardMetrics, MouseMetrics
from schemas import MetricsRequest


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
# POST metrics
# -------------------------

@app.post("/api/metrics")
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


    # Add all three
    db.add(click_metrics)
    db.add(keyboard_metrics)
    db.add(mouse_metrics)


    # Save everything
    db.commit()


    return {
        "message": "Metrics saved successfully"
    }