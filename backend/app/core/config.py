"""Runtime configuration, read from environment variables (.env in development)."""

import os
from pathlib import Path

from dotenv import load_dotenv

# backend/ — the directory that contains app/, assets/, ml/ and .env
BASE_DIR = Path(__file__).resolve().parents[2]

load_dotenv(BASE_DIR / ".env")


def _bool(name, default):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _database_url():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("Environment variable DATABASE_URL is required. See .env.example.")
    # SQLAlchemy 2.1+ maps "postgresql://" to psycopg 3; this project ships psycopg2.
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url.removeprefix("postgresql://")
    return url


DATABASE_URL = _database_url()

# Long random string. Signs CAPTCHA answers. Checked at API start-up (see validate()),
# so the ML scripts can import the models without it.
SECRET_KEY = os.getenv("SECRET_KEY", "")

# Public URL of the dashboard (used in emails, Stripe redirects).
APP_URL = os.getenv("APP_URL", "http://localhost:5174").rstrip("/")

# Public URL of this API as seen by your customers' browsers (used in challenge URLs).
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://localhost:8000").rstrip("/")

# Session cookie
COOKIE_NAME = "mc_session"
COOKIE_SECURE = _bool("COOKIE_SECURE", True)
SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))

# Honour X-Forwarded-For when running behind a reverse proxy / load balancer.
TRUST_PROXY = _bool("TRUST_PROXY", False)

# Email (optional). Without SMTP_HOST, messages are written to the server log instead.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "motion-captcha <no-reply@localhost>")
SMTP_STARTTLS = _bool("SMTP_STARTTLS", True)
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "")

# Stripe (optional). Without STRIPE_SECRET_KEY, billing endpoints answer 503.
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "")
STRIPE_PRICE_BUSINESS = os.getenv("STRIPE_PRICE_BUSINESS", "")

# Bearer token for the internal training-data endpoint. Empty disables the endpoint.
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")

# Path to the built dashboard (dashboard/dist). When set, the API also serves the dashboard.
DASHBOARD_DIST = os.getenv("DASHBOARD_DIST", "")

# Model and font
MODEL_PATH = Path(os.getenv("MODEL_PATH", BASE_DIR / "assets" / "models" / "risk_model.joblib"))
CAPTCHA_FONT_PATH = Path(os.getenv("CAPTCHA_FONT_PATH", BASE_DIR / "assets" / "fonts" / "anniesgrids.ttf"))


def validate():
    """Called when the API starts. Fails fast on settings the API can't run without."""
    if not SECRET_KEY:
        raise RuntimeError("Environment variable SECRET_KEY is required. See .env.example.")
