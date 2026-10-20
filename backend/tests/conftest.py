"""
Test setup.

Runs against a real PostgreSQL database given by TEST_DATABASE_URL. Every table in that
database is dropped and recreated, so never point it at a database you care about.

    TEST_DATABASE_URL=postgresql://postgres:pw@localhost:5432/motion_captcha_test pytest

A tiny stand-in risk model is generated, so the real risk_model.joblib isn't needed.
It always returns a bot probability of 0.25 (risk score 25 → static CAPTCHA).
"""

import os
import tempfile
import uuid

import pytest

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytest.exit("Set TEST_DATABASE_URL to a disposable PostgreSQL database to run the tests.", returncode=1)

_tmp = tempfile.mkdtemp(prefix="motion-captcha-tests-")
os.environ.update({
    "DATABASE_URL": TEST_DATABASE_URL,
    "SECRET_KEY": "test-secret-key",
    "MODEL_PATH": os.path.join(_tmp, "risk_model.joblib"),
    "COOKIE_SECURE": "false",
    "APP_URL": "http://dashboard.test",
    "PUBLIC_API_URL": "http://api.test",
    "INTERNAL_API_TOKEN": "internal-test-token",
    "STRIPE_SECRET_KEY": "",
    "STRIPE_WEBHOOK_SECRET": "whsec_test",
    "STRIPE_PRICE_PRO": "price_pro",
    "STRIPE_PRICE_BUSINESS": "price_business",
    "SMTP_HOST": "",
    "DASHBOARD_DIST": "",
})


def _write_stub_model(path):
    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.dummy import DummyClassifier

    features = [
        "click_average_interval", "click_interval_variance", "total_clicks",
        "average_hold_duration", "keyboard_average_interval", "hold_duration_variance",
        "keyboard_interval_variance", "total_key_presses",
        "average_acceleration", "average_velocity", "direction_changes", "max_velocity",
        "total_distance", "total_samples",
    ]
    X = pd.DataFrame(np.zeros((4, len(features))), columns=features)
    model = DummyClassifier(strategy="prior").fit(X, [0, 0, 0, 1])   # P(bot) = 0.25
    joblib.dump({"catboost": model, "tabpfn": model, "features": features,
                 "catboost_weight": 0.5, "tabpfn_weight": 0.5}, path)


_write_stub_model(os.environ["MODEL_PATH"])

# Import the app only after the environment is set.
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import answer_hash  # noqa: E402
from app.main import app  # noqa: E402

METRICS = {
    "clicks": {"averageInterval": 420, "intervalVariance": 9000, "totalClicks": 4},
    "keyboard": {"averageHoldDuration": 95, "averageInterval": 180, "holdDurationVariance": 400,
                 "intervalVariance": 2500, "totalKeyPresses": 14},
    "mouse": {"averageAcceleration": 0.01, "averageVelocity": 0.6, "directionChanges": 30,
              "maxVelocity": 3.1, "totalDistance": 2400, "totalSamples": 180},
}


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Sign-up/login throttles share one test-client IP; reset them between tests."""
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM rate_windows"))


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def emails(monkeypatch):
    """Captures outgoing emails instead of sending them."""
    sent = []

    def fake_send(to, subject, body):
        sent.append({"to": [to] if isinstance(to, str) else list(to), "subject": subject, "body": body})

    for module in ("app.services.notifications", "app.api.dashboard.auth", "app.api.dashboard.team",
                   "app.api.dashboard.rate_limits"):
        monkeypatch.setattr(f"{module}.send_email", fake_send)
    return sent


def new_client() -> TestClient:
    # Not used as a context manager: tables already exist and the model loads lazily,
    # so the lifespan (and its maintenance loop) isn't needed for every client.
    return TestClient(app)


@pytest.fixture
def public():
    """Client for the public CAPTCHA API (no session cookie)."""
    return new_client()


def signup(client=None, company="Acme Inc", password="supersecret1", **extra):
    client = client or new_client()
    email = f"user-{uuid.uuid4().hex[:10]}@acme-corp.com"
    r = client.post("/api/auth/signup", json={"name": "Ada Owner", "company": company, "email": email,
                                              "password": password, **extra})
    assert r.status_code == 200, r.text
    client.user = r.json()
    client.email = email
    return client


@pytest.fixture
def owner():
    """A signed-in owner of a fresh organisation."""
    return signup()


def create_key(client, **body):
    payload = {"name": "login-page", **body}
    r = client.post("/api/keys", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["key"], r.json()["secret"]


def start_flow(public, site_key, origin="https://www.example.com"):
    """assess + challenge; returns the token."""
    r = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": site_key, "Origin": origin})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    assert public.get(f"/v1/challenge/{token}").status_code == 200
    return token


def plant_answer(token, answer):
    """The real answer is only stored as an HMAC; replace it with a known one."""
    with engine.begin() as conn:
        conn.execute(text("UPDATE challenges SET answer_hash = :h WHERE token = :t"),
                     {"h": answer_hash(token, answer), "t": token})


def verify(public, secret, token, answer):
    return public.post("/v1/verify", json={"token": token, "answer": answer},
                       headers={"Authorization": f"Bearer {secret}"})
