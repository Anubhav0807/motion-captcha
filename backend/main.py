from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import logging

from database import engine, Base, get_db
from schemas import MetricsRequest, RiskScoreData
from models import RiskScoreRecord

from captcha_service import prepare_captcha
from metrics_service import calculate_risk_score, save_metrics_to_db


logger = logging.getLogger(__name__)

# Create all database tables
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
@app.get("/api")
def health():
    return {
        "status": "ok",
        "service": "Motion Captcha API",
        "api_base_url": "/api",
    }


# -------------------------
# GET captcha
# -------------------------

@app.get("/api/captcha")
def get_captcha(
    background_tasks: BackgroundTasks,
    token: str,
    uppercase: bool = True,
    lowercase: bool = True,
    numbers: bool = True,
    db: Session = Depends(get_db),
):
    # Retrieve the risk assessment associated with the token
    record = (
        db.query(RiskScoreRecord)
        .filter(RiskScoreRecord.token == token)
        .first()
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Invalid or unknown risk assessment token",
        )

    risk_score = record.risk_score

    # Select CAPTCHA type based on bot risk
    captcha_type = "dynamic" if risk_score >= 70 else "static"

    config = {
        "uppercase": uppercase,
        "lowercase": lowercase,
        "numbers": numbers,
    }

    try:
        image_path, file_type = prepare_captcha(background_tasks, config, captcha_type)
    except Exception as exc:
        logger.exception("Failed to prepare CAPTCHA")
        raise HTTPException(
            status_code=500,
            detail="CAPTCHA generation failed",
        ) from exc

    return FileResponse(
        path=image_path,
        media_type=f"image/{file_type}",
        content_disposition_type="inline",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


# -------------------------
# POST metrics: risk analysis
# -------------------------

@app.post("/api/metrics", response_model=RiskScoreData)
def analyze_risk(
    data: MetricsRequest,
    db: Session = Depends(get_db),
):
    return calculate_risk_score(data, db)


# -------------------------
# POST metrics: database persistence
# -------------------------

@app.post("/api/save-metrics")
def save_metrics(
    data: MetricsRequest,
    db: Session = Depends(get_db),
):
    return save_metrics_to_db(data, db)
