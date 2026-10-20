"""All ORM models. Importing this package registers every table on Base.metadata."""

from app.models.base import Base, new_id, utcnow
from app.models.training import ClickMetrics, KeyboardMetrics, MouseMetrics, PredictionLabel, PredictionResults
from app.models.account import Invite, Notification, Organization, PasswordReset, User, UserSession
from app.models.api_key import ApiKey
from app.models.captcha import Assessment, Challenge
from app.models.metering import AlertSent, Event, LimitIncreaseRequest, RateWindow, UsageDaily

__all__ = [
    "Base", "new_id", "utcnow",
    "ClickMetrics", "KeyboardMetrics", "MouseMetrics", "PredictionLabel", "PredictionResults",
    "Invite", "Notification", "Organization", "PasswordReset", "User", "UserSession",
    "ApiKey",
    "Assessment", "Challenge",
    "AlertSent", "Event", "LimitIncreaseRequest", "RateWindow", "UsageDaily",
]
