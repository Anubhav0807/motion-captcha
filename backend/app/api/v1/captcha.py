"""
Public CAPTCHA API used by customers.

Flow
  1. Browser (widget.js, site key)   POST /v1/assess           -> token
  2. Browser                         GET  /v1/challenge/{token} -> PNG (low risk) or GIF (high risk)
  3. Customer's server (secret key)  POST /v1/verify            -> {success, risk_score, ...}
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.api.deps import client_info
from app.core import config
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.plans import get_plan
from app.core.security import SECRET_KEY_PREFIX, answer_hash, safe_equals, sha256
from app.models import ApiKey, Assessment, Challenge, Organization
from app.schemas.captcha import AssessResponse, MetricsRequest, VerifyRequest, VerifyResponse
from app.services.captcha_renderer import generate_captcha
from app.services.metering import month_verifications, record_event
from app.services.rate_limiter import hit
from app.services.risk_model import calculate_risk_score
from app.services.usage_alerts import check_usage_alerts

logger = logging.getLogger("motion_captcha.public")

router = APIRouter(tags=["CAPTCHA API"])

MAX_REFRESHES = 5
NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


def domain_allowed(host: str | None, allowed: list[str]) -> bool:
    """'example.com' allows example.com and every subdomain. Empty list allows any origin."""
    if not allowed:
        return True
    if not host:
        return False
    for domain in allowed:
        domain = domain.lower().lstrip("*.").strip()
        if host == domain or host.endswith("." + domain):
            return True
    return False


def _limit(db: Session, key: ApiKey, org: Organization, endpoint: str):
    rpm = key.rpm_override or get_plan(org.plan)["rpm"]
    allowed, retry_after = hit(db, f"key:{key.id}:{endpoint}", rpm)
    return allowed, retry_after


# ------------------------------------------------------------------ assess

@router.post("/assess", response_model=AssessResponse)
def assess(
    data: MetricsRequest,
    request: Request,
    x_site_key: str = Header(default="", alias="X-Site-Key"),
    db: Session = Depends(get_db),
):
    started = time.perf_counter()
    client = client_info(request)

    key = db.query(ApiKey).filter(ApiKey.site_key == x_site_key).first() if x_site_key else None
    if key is None:
        raise ApiError(401, "invalid_site_key", "Unknown site key.")
    org = db.get(Organization, key.org_id)

    def reject(status, code, message, outcome="rejected", headers=None):
        record_event(db, key, type="assess", outcome=outcome, status_code=status, started=started,
                     client=client, error_code=code)
        raise ApiError(status, code, message, headers)

    if key.status != "active":
        reject(403, "key_revoked", "This site key has been revoked.")

    if not domain_allowed(client["origin"], key.allowed_domains):
        reject(403, "origin_not_allowed", f"Requests from '{client['origin'] or 'unknown origin'}' are not allowed for this key.")

    allowed, retry_after = _limit(db, key, org, "assess")
    if not allowed:
        reject(429, "rate_limited", "Too many requests.", "rate_limited", {"Retry-After": str(retry_after)})

    if month_verifications(db, org.id) >= get_plan(org.plan)["verifications"]:
        reject(429, "quota_exceeded", "Monthly verification quota reached.", "quota_exceeded")

    try:
        risk_score = calculate_risk_score(data)
    except Exception:
        logger.exception("Risk model failed")
        record_event(db, key, type="assess", outcome="error", status_code=500, started=started,
                     client=client, error_code="model_error")
        raise ApiError(500, "model_error", "Risk assessment failed. Please retry.")

    challenge_type = "dynamic" if risk_score >= key.dynamic_threshold else "static"
    assessment = Assessment(
        api_key_id=key.id,
        org_id=org.id,
        risk_score=risk_score,
        challenge_type=challenge_type,
        origin=client["origin"],
        ip=client["ip"],
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=key.challenge_ttl),
    )
    db.add(assessment)
    db.flush()

    record_event(db, key, type="assess", outcome="ok", status_code=200, started=started, client=client,
                 risk_score=risk_score, challenge_type=challenge_type, token=assessment.token)

    # The risk score is deliberately NOT returned to the browser; only the
    # customer's server learns it, via /v1/verify.
    return AssessResponse(
        token=assessment.token,
        expires_in=key.challenge_ttl,
        risk_score=risk_score
    )


# ------------------------------------------------------------------ challenge

@router.get("/challenge/{token}", responses={200: {"content": {"image/png": {}, "image/gif": {}}}})
def challenge(token: str, request: Request, db: Session = Depends(get_db)):
    """Returns a fresh image each call (that's how 'refresh' works); the previous answer stops working."""
    started = time.perf_counter()
    client = client_info(request)

    assessment = db.get(Assessment, token[:36])
    if assessment is None:
        raise ApiError(404, "invalid_token", "Unknown CAPTCHA token.")
    key = db.get(ApiKey, assessment.api_key_id)
    org = db.get(Organization, key.org_id)

    def reject(status, code, message, outcome="rejected", headers=None):
        record_event(db, key, type="challenge", outcome=outcome, status_code=status, started=started,
                     client=client, error_code=code, token=assessment.token)
        raise ApiError(status, code, message, headers)

    if key.status != "active":
        reject(403, "key_revoked", "This site key has been revoked.")
    if assessment.expires_at <= datetime.now(timezone.utc):
        reject(410, "token_expired", "This CAPTCHA has expired. Request a new one.")

    allowed, retry_after = _limit(db, key, org, "challenge")
    if not allowed:
        reject(429, "rate_limited", "Too many requests.", "rate_limited", {"Retry-After": str(retry_after)})

    existing = db.get(Challenge, assessment.token)
    if existing is not None:
        if existing.consumed_at is not None:
            reject(410, "token_used", "This CAPTCHA has already been answered.")
        if existing.refreshes >= MAX_REFRESHES:
            reject(429, "too_many_refreshes", "Refresh limit reached. Start a new CAPTCHA.")

    config_ = {"uppercase": key.uppercase, "lowercase": key.lowercase, "numbers": key.numbers}
    try:
        text, image_bytes, extension = generate_captcha(assessment.challenge_type, config_, key.length)
    except Exception:
        logger.exception("CAPTCHA generation failed")
        db.rollback()
        record_event(db, key, type="challenge", outcome="error", status_code=500, started=started,
                     client=client, error_code="generation_failed", token=assessment.token)
        raise ApiError(500, "generation_failed", "CAPTCHA generation failed.")

    normalized = text if key.case_sensitive else text.lower()
    digest = answer_hash(assessment.token, normalized)
    if existing is None:
        db.add(Challenge(token=assessment.token, answer_hash=digest, refreshes=1))
    else:
        existing.answer_hash = digest
        existing.refreshes += 1
        existing.issued_at = datetime.now(timezone.utc)

    record_event(db, key, type="challenge", outcome="ok", status_code=200, started=started, client=client,
                 risk_score=assessment.risk_score, challenge_type=assessment.challenge_type, token=assessment.token)

    return Response(content=image_bytes, media_type=f"image/{extension}", headers=NO_CACHE)


# ------------------------------------------------------------------ verify

@router.post("/verify", response_model=VerifyResponse)
def verify(
    payload: VerifyRequest,
    request: Request,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Server-to-server. Authenticate with `Authorization: Bearer mc_sk_...`."""
    started = time.perf_counter()
    client = client_info(request)
    client["ip"] = payload.remote_ip or client["ip"]

    secret = authorization.removeprefix("Bearer ").strip()
    key = (
        db.query(ApiKey).filter(ApiKey.secret_hash == sha256(secret)).first()
        if secret.startswith(SECRET_KEY_PREFIX) else None
    )
    if key is None:
        raise ApiError(401, "invalid_secret", "Missing or invalid secret key.")
    org = db.get(Organization, key.org_id)

    if key.status != "active":
        record_event(db, key, type="verify", outcome="rejected", status_code=403, started=started,
                     client=client, error_code="key_revoked")
        raise ApiError(403, "key_revoked", "This key has been revoked.")

    allowed, retry_after = _limit(db, key, org, "verify")
    if not allowed:
        record_event(db, key, type="verify", outcome="rate_limited", status_code=429, started=started,
                     client=client, error_code="rate_limited")
        raise ApiError(429, "rate_limited", "Too many requests.", {"Retry-After": str(retry_after)})

    def fail(code, assessment=None, billable=False):
        record_event(
            db, key, type="verify", outcome="failed" if billable else "rejected", status_code=200,
            started=started, client=client, error_code=code,
            risk_score=assessment.risk_score if assessment else None,
            challenge_type=assessment.challenge_type if assessment else None,
            token=payload.token[:36],
        )
        if billable:
            check_usage_alerts(db, org)
        return VerifyResponse(
            success=False,
            risk_score=assessment.risk_score if assessment else None,
            challenge_type=assessment.challenge_type if assessment else None,
            hostname=assessment.origin if assessment else None,
            error_codes=[code],
        )

    assessment = db.get(Assessment, payload.token[:36])
    if assessment is None or assessment.api_key_id != key.id:
        return fail("invalid-token")

    challenge_row = db.get(Challenge, assessment.token)
    if challenge_row is None:
        return fail("challenge-not-issued", assessment)

    # Single use: atomically claim the challenge before comparing answers.
    claimed = db.execute(
        update(Challenge)
        .where(Challenge.token == assessment.token, Challenge.consumed_at.is_(None))
        .values(consumed_at=datetime.now(timezone.utc))
    ).rowcount
    db.commit()
    if not claimed:
        return fail("token-already-used", assessment)

    if assessment.expires_at <= datetime.now(timezone.utc):
        return fail("token-expired", assessment, billable=True)

    answer = payload.answer.strip()
    if not key.case_sensitive:
        answer = answer.lower()
    if not safe_equals(answer_hash(assessment.token, answer), challenge_row.answer_hash):
        return fail("incorrect-answer", assessment, billable=True)

    record_event(db, key, type="verify", outcome="passed", status_code=200, started=started, client=client,
                 risk_score=assessment.risk_score, challenge_type=assessment.challenge_type,
                 token=assessment.token)
    check_usage_alerts(db, org)

    return VerifyResponse(
        success=True,
        risk_score=assessment.risk_score,
        challenge_type=assessment.challenge_type,
        hostname=assessment.origin,
        challenge_ts=assessment.created_at.isoformat(),
    )
