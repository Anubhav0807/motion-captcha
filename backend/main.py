from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import logging

from database import engine, Base, get_db
from schemas import MetricsRequest, RiskScoreData, CaptchaData
from models import RiskScoreRecord, CaptchaChallenge

from captcha_service import generate_captcha
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


# Health routes
@app.get("/")
@app.get("/api")
def health():
    return {
        "status": "ok",
        "service": "Motion Captcha API",
        "api_base_url": "/api",
    }


@app.get("/api/captcha")
def get_captcha(
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
    captcha_type = "dynamic" if risk_score >= 50 else "static"

    config = {
        "uppercase": uppercase,
        "lowercase": lowercase,
        "numbers": numbers,
    }

    try:
        captcha_text, image_path, file_type = generate_captcha(captcha_type, config)

        challenge = CaptchaChallenge(
            token=token,
            captcha_text=captcha_text
        )

        db.merge(challenge)
        db.commit()

    except Exception as exc:
        db.rollback()
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


@app.post("/api/captcha")
def verify_captcha(
    payload: CaptchaData,
    db: Session = Depends(get_db)
):
    captcha = (
        db.query(CaptchaChallenge)
        .filter(CaptchaChallenge.token == payload.token)
        .first()
    )

    if captcha is None:
        raise HTTPException(
            status_code=404,
            detail="CAPTCHA token not found or expired."
        )

    if captcha.captcha_text != payload.captcha_text:
        raise HTTPException(
            status_code=400,
            detail="Incorrect CAPTCHA."
        )

    return {
        "success": True,
        "message": "CAPTCHA verified successfully."
    }


@app.post("/api/metrics", response_model=RiskScoreData)
def analyze_risk(
    data: MetricsRequest,
    db: Session = Depends(get_db),
):
    return calculate_risk_score(data, db)


@app.post("/api/save-metrics")
def save_metrics(
    data: MetricsRequest,
    db: Session = Depends(get_db),
):
    return save_metrics_to_db(data, db)
