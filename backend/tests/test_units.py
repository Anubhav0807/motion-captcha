"""Pure functions: domain rules, rendering, risk model, rate limiter."""

import io

import pytest
from PIL import Image

from app.api.v1.captcha import domain_allowed
from app.schemas.captcha import MetricsRequest
from app.schemas.keys import clean_domains
from app.services.captcha_renderer import generate_captcha, generate_captcha_text
from app.services.rate_limiter import hit
from app.services.risk_model import calculate_risk_score
from tests.conftest import METRICS


@pytest.mark.parametrize("host, allowed, expected", [
    ("example.com", ["example.com"], True),
    ("a.b.example.com", ["example.com"], True),
    ("badexample.com", ["example.com"], False),
    ("example.com.evil.io", ["example.com"], False),
    (None, ["example.com"], False),
    (None, [], True),
    ("anything.io", [], True),
])
def test_domain_allowed(host, allowed, expected):
    assert domain_allowed(host, allowed) is expected


def test_clean_domains():
    assert clean_domains(["HTTPS://Shop.Example.com:443/x", "*.acme.io", "acme.io", " ", "127.0.0.1"]) == \
        ["shop.example.com", "acme.io", "127.0.0.1"]
    with pytest.raises(ValueError):
        clean_domains(["has space.com"])


def test_captcha_text_respects_character_sets():
    text = generate_captcha_text({"uppercase": False, "lowercase": False, "numbers": True}, length=8)
    assert len(text) == 8 and text.isdigit()


def test_static_and_dynamic_rendering():
    text, png, ext = generate_captcha("static", length=5)
    assert ext == "png" and len(text) == 5 and Image.open(io.BytesIO(png)).size == (250, 100)

    _, gif, ext = generate_captcha("dynamic")
    image = Image.open(io.BytesIO(gif))
    assert ext == "gif" and image.n_frames == 312 and image.info["duration"] == 20


def test_risk_model_score_range():
    assert calculate_risk_score(MetricsRequest(**METRICS)) == 25


def test_rate_limiter(db):
    results = [hit(db, "unit-test-subject", limit=2)[0] for _ in range(3)]
    assert results == [True, True, False]
