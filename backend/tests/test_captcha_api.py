"""Public CAPTCHA API: /v1/assess, /v1/challenge, /v1/verify."""

from datetime import date

from sqlalchemy import text

from app.core.database import engine
from tests.conftest import METRICS, create_key, plant_answer, start_flow, verify


def test_full_flow_passes_with_correct_answer(owner, public):
    key, secret = create_key(owner, allowedDomains=["example.com"])
    token = start_flow(public, key["siteKey"])
    plant_answer(token, "Kx7pQ2")

    body = verify(public, secret, token, "Kx7pQ2").json()

    assert body["success"] is True
    assert body["risk_score"] == 25
    assert body["challenge_type"] == "static"
    assert body["hostname"] == "www.example.com"
    assert body["error_codes"] == []


def test_assess_never_reveals_risk_score_to_browser(owner, public):
    key, _ = create_key(owner)
    r = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]})
    assert set(r.json()) == {"token", "challenge_url", "expires_in"}
    assert r.json()["challenge_url"] == f"http://api.test/v1/challenge/{r.json()['token']}"


def test_wrong_answer_fails_and_token_is_single_use(owner, public):
    key, secret = create_key(owner)
    token = start_flow(public, key["siteKey"])

    first = verify(public, secret, token, "nope").json()
    second = verify(public, secret, token, "nope").json()

    assert first["success"] is False and first["error_codes"] == ["incorrect-answer"]
    assert second["error_codes"] == ["token-already-used"]


def test_case_insensitive_key_accepts_any_case(owner, public):
    key, secret = create_key(owner, settings={"caseSensitive": False})
    token = start_flow(public, key["siteKey"])
    plant_answer(token, "abc12")
    assert verify(public, secret, token, "  ABC12 ").json()["success"] is True


def test_case_sensitive_key_rejects_wrong_case(owner, public):
    key, secret = create_key(owner)
    token = start_flow(public, key["siteKey"])
    plant_answer(token, "AbC12")
    assert verify(public, secret, token, "abc12").json()["error_codes"] == ["incorrect-answer"]


def test_origin_allowlist_includes_subdomains(owner, public):
    key, _ = create_key(owner, allowedDomains=["shop.example.com"])
    headers = {"X-Site-Key": key["siteKey"]}

    blocked = public.post("/v1/assess", json=METRICS, headers={**headers, "Origin": "https://evil.com"})
    allowed = public.post("/v1/assess", json=METRICS, headers={**headers, "Origin": "https://eu.shop.example.com"})
    no_origin = public.post("/v1/assess", json=METRICS, headers=headers)

    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "origin_not_allowed"
    assert allowed.status_code == 200
    assert no_origin.status_code == 403


def test_unknown_site_key_is_rejected(public):
    r = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": "mc_pk_nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_site_key"


def test_invalid_metrics_are_rejected(owner, public):
    key, _ = create_key(owner)
    bad = {**METRICS, "clicks": {**METRICS["clicks"], "totalClicks": -1}}
    r = public.post("/v1/assess", json=bad, headers={"X-Site-Key": key["siteKey"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_static_challenge_is_png_and_motion_challenge_is_gif(owner, public):
    low, _ = create_key(owner, name="always-static", settings={"dynamicThreshold": 101})
    high, _ = create_key(owner, name="always-motion", settings={"dynamicThreshold": 0})

    for key, mime in ((low, "image/png"), (high, "image/gif")):
        token = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]}).json()["token"]
        image = public.get(f"/v1/challenge/{token}")
        assert image.headers["content-type"] == mime
        assert image.headers["cache-control"].startswith("no-store")


def test_challenge_refresh_limit(owner, public):
    key, _ = create_key(owner)
    token = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]}).json()["token"]
    codes = [public.get(f"/v1/challenge/{token}").status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]


def test_verify_requires_valid_secret(owner, public):
    key, _ = create_key(owner)
    token = start_flow(public, key["siteKey"])
    assert verify(public, "mc_sk_wrong", token, "x").status_code == 401
    assert public.post("/v1/verify", json={"token": token, "answer": "x"}).status_code == 401


def test_token_from_another_key_is_invalid(owner, public):
    key_a, _ = create_key(owner, name="site-a")
    _, secret_b = create_key(owner, name="site-b")
    token = start_flow(public, key_a["siteKey"])
    assert verify(public, secret_b, token, "x").json()["error_codes"] == ["invalid-token"]


def test_expired_token_fails(owner, public):
    key, secret = create_key(owner)
    token = start_flow(public, key["siteKey"])
    plant_answer(token, "right")
    with engine.begin() as conn:
        conn.execute(text("UPDATE assessments SET expires_at = now() - interval '1 second' WHERE token = :t"), {"t": token})
    assert verify(public, secret, token, "right").json()["error_codes"] == ["token-expired"]


def test_verify_before_image_loaded(owner, public):
    key, secret = create_key(owner)
    token = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]}).json()["token"]
    assert verify(public, secret, token, "x").json()["error_codes"] == ["challenge-not-issued"]


def test_rate_limit_returns_429_with_retry_after(owner, public):
    key, _ = create_key(owner)
    with engine.begin() as conn:
        conn.execute(text("UPDATE api_keys SET rpm_override = 3 WHERE id = :k"), {"k": key["id"]})
    responses = [public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]}) for _ in range(4)]
    assert [r.status_code for r in responses] == [200, 200, 200, 429]
    assert int(responses[-1].headers["retry-after"]) >= 1


def test_quota_exceeded_blocks_new_challenges(owner, public):
    key, _ = create_key(owner)
    org_id = owner.user["organization"]["id"]
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO usage_daily (day, api_key_id, org_id, assessments, challenges_static, challenges_dynamic, "
            "verifications_passed, verifications_failed, errors, rate_limited, risk_sum, risk_count, "
            "risk_b0, risk_b1, risk_b2, risk_b3, risk_b4) "
            "VALUES (:d, :k, :o, 0, 0, 0, 10000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)"
        ), {"d": date.today(), "k": "seed-" + key["id"][:30], "o": org_id})
    r = public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]})
    assert r.status_code == 429 and r.json()["error"]["code"] == "quota_exceeded"


def test_revoked_key_stops_working(owner, public):
    key, secret = create_key(owner)
    token = start_flow(public, key["siteKey"])
    owner.post(f"/api/keys/{key['id']}/revoke")
    assert public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]}).status_code == 403
    assert verify(public, secret, token, "x").status_code == 403


def test_every_call_is_metered(owner, public):
    key, secret = create_key(owner)
    token = start_flow(public, key["siteKey"])
    verify(public, secret, token, "wrong")

    totals = owner.get("/api/usage/timeseries", params={"keyId": key["id"]}).json()["totals"]
    assert totals["assessments"] == 1
    assert totals["challengesStatic"] == 1
    assert totals["failed"] == 1
    assert totals["riskBuckets"] == [0, 1, 0, 0, 0]   # score 25 → 20–39 bucket


def test_widget_is_served_with_cors(public):
    r = public.get("/v1/widget.js")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/javascript")
    assert r.headers["access-control-allow-origin"] == "*"


def test_internal_training_endpoint_requires_token(public, db):
    from app.models import PredictionResults
    before = db.query(PredictionResults).count()
    hidden = public.post("/internal/training-metrics", json={**METRICS, "label": "bot"})
    ok = public.post("/internal/training-metrics", json={**METRICS, "label": "bot"},
                     headers={"Authorization": "Bearer internal-test-token"})
    assert hidden.status_code == 404
    assert ok.status_code == 200
    assert db.query(PredictionResults).count() == before + 1


def test_health(public):
    assert public.get("/health").json() == {"status": "ok", "service": "motion-captcha"}

