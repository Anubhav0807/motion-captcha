"""Internal endpoints (hidden from the OpenAPI docs)."""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core import config
from app.core.database import get_db
from app.core.errors import ApiError
from app.core.security import safe_equals
from app.models import PredictionLabel
from app.schemas.captcha import LabeledMetricsRequest
from app.services.training_data import save_metrics_to_db

router = APIRouter(prefix="/internal", include_in_schema=False)


@router.post("/training-metrics")
def save_training_metrics(
    data: LabeledMetricsRequest,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Collect labelled behaviour for retraining. Requires INTERNAL_API_TOKEN."""
    token = authorization.removeprefix("Bearer ").strip()
    if not config.INTERNAL_API_TOKEN or not safe_equals(token, config.INTERNAL_API_TOKEN):
        raise ApiError(404, "not_found", "Not found.")
    return save_metrics_to_db(data, db, PredictionLabel(data.label))
