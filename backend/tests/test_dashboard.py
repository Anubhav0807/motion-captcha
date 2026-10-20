"""Dashboard API: accounts, keys, analytics, logs, quota, rate limits, team, settings."""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.database import engine
from tests.conftest import METRICS, create_key, new_client, plant_answer, signup, start_flow, verify


# ------------------------------------------------------------------ auth

def test_signup_starts_session_on_free_plan(owner):
    me = owner.get("/api/auth/me").json()
    assert me["role"] == "owner"
    assert me["organization"]["plan"] == "free"
    assert "keys:write" in me["permissions"]


def test_duplicate_email_and_bad_login():
    client = signup()
    again = new_client().post("/api/auth/signup", json={"name": "X", "company": "Other", "email": client.email,
                                                         "password": "supersecret1"})
    bad = new_client().post("/api/auth/login", json={"email": client.email, "password": "wrong-password"})
    assert again.status_code == 409
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"


def test_login_logout_cycle(owner):
    fresh = new_client()
    assert fresh.post("/api/auth/login", json={"email": owner.email, "password": "supersecret1"}).status_code == 200
    assert fresh.get("/api/auth/me").status_code == 200
    fresh.post("/api/auth/logout")
    assert fresh.get("/api/auth/me").status_code == 401


def test_unauthenticated_requests_are_rejected():
    r = new_client().get("/api/keys")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthenticated"


def test_password_reset_flow(owner, emails):
    new_client().post("/api/auth/forgot-password", json={"email": owner.email})
    token = re.search(r"reset-password\?token=(\S+)", emails[-1]["body"]).group(1)

    assert new_client().post("/api/auth/reset-password", json={"token": token, "password": "brand-new-pass"}).status_code == 204
    assert owner.get("/api/auth/me").status_code == 401        # old sessions revoked
    assert new_client().post("/api/auth/login", json={"email": owner.email, "password": "brand-new-pass"}).status_code == 200
    assert new_client().post("/api/auth/reset-password", json={"token": token, "password": "again-again"}).status_code == 400


def test_forgot_password_does_not_reveal_accounts(emails):
    r = new_client().post("/api/auth/forgot-password", json={"email": "nobody@acme-corp.com"})
    assert r.status_code == 204 and emails == []


def test_change_password(owner):
    wrong = owner.post("/api/auth/change-password", json={"current_password": "nope", "new_password": "newpassword1"})
    right = owner.post("/api/auth/change-password", json={"current_password": "supersecret1", "new_password": "newpassword1"})
    assert wrong.status_code == 400
    assert right.status_code == 204
    assert owner.get("/api/auth/me").status_code == 200        # current session survives


# ------------------------------------------------------------------ keys

def test_key_lifecycle(owner, public):
    key, secret = create_key(owner, allowedDomains=["https://Shop.Example.com/login", "*.acme.io", "localhost"])
    assert key["allowedDomains"] == ["shop.example.com", "acme.io", "localhost"]
    assert secret.startswith("mc_sk_") and key["siteKey"].startswith("mc_pk_")
    assert key["secretLast4"] == secret[-4:]

    edited = owner.patch(f"/api/keys/{key['id']}", json={"name": "renamed", "settings": {"length": 8}}).json()
    assert edited["name"] == "renamed" and edited["settings"]["length"] == 8

    rolled = owner.post(f"/api/keys/{key['id']}/roll-secret").json()
    assert rolled["secret"] != secret
    token = start_flow(public, key["siteKey"], origin="https://shop.example.com")
    assert verify(public, secret, token, "x").status_code == 401          # old secret dead
    assert verify(public, rolled["secret"], token, "x").status_code == 200

    assert owner.delete(f"/api/keys/{key['id']}").status_code == 409       # must revoke first
    owner.post(f"/api/keys/{key['id']}/revoke")
    assert owner.delete(f"/api/keys/{key['id']}").status_code == 204
    assert owner.get("/api/keys").json() == []


def test_key_validation(owner):
    bad_domain = owner.post("/api/keys", json={"name": "bad", "allowedDomains": ["not a domain"]})
    no_charset = owner.post("/api/keys", json={"name": "bad", "settings": {"uppercase": False, "lowercase": False, "numbers": False}})
    assert bad_domain.status_code == 422 and "not a valid domain" in bad_domain.json()["error"]["message"]
    assert no_charset.status_code == 400


def test_free_plan_key_limit(owner):
    for i in range(3):
        create_key(owner, name=f"key-{i}")
    r = owner.post("/api/keys", json={"name": "one-too-many"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "key_limit"


def test_keys_are_isolated_between_organisations(owner):
    key, _ = create_key(owner)
    other = signup(company="Other Co")
    assert other.get("/api/keys").json() == []
    assert other.post(f"/api/keys/{key['id']}/revoke").status_code == 404


# ------------------------------------------------------------------ analytics, logs, quota, limits

def test_usage_analytics(owner, public):
    key, secret = create_key(owner)
    t1 = start_flow(public, key["siteKey"])
    plant_answer(t1, "right")
    verify(public, secret, t1, "right")
    verify(public, secret, start_flow(public, key["siteKey"]), "wrong")

    daily = owner.get("/api/usage/timeseries").json()
    assert daily["granularity"] == "day" and len(daily["points"]) == 31
    assert daily["totals"]["passed"] == 1 and daily["totals"]["failed"] == 1 and daily["totals"]["assessments"] == 2

    since = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    hourly = owner.get("/api/usage/timeseries", params={"granularity": "hour", "from": since}).json()
    assert hourly["totals"]["passed"] == 1 and hourly["totals"]["riskSum"] == 50

    by_key = owner.get("/api/usage/by-key").json()
    assert by_key[0]["keyId"] == key["id"] and by_key[0]["passed"] == 1

    too_long = owner.get("/api/usage/timeseries", params={"granularity": "hour", "from": "2020-01-01T00:00:00Z"})
    assert too_long.status_code == 400


def test_logs_pagination_and_flow(owner, public):
    key, secret = create_key(owner)
    for _ in range(3):
        verify(public, secret, start_flow(public, key["siteKey"]), "wrong")

    page1 = owner.get("/api/logs", params={"limit": 4}).json()
    page2 = owner.get("/api/logs", params={"limit": 4, "cursor": page1["nextCursor"]}).json()
    assert len(page1["items"]) == 4 and page1["retentionDays"] == 7
    assert int(page2["items"][0]["id"]) < int(page1["items"][-1]["id"])

    # Walk every page: 3 flows x (assess, challenge, verify) = 9 events, no duplicates.
    ids, cursor = [], None
    while True:
        page = owner.get("/api/logs", params={"limit": 4, **({"cursor": cursor} if cursor else {})}).json()
        ids += [e["id"] for e in page["items"]]
        cursor = page["nextCursor"]
        if not cursor:
            break
    assert len(ids) == len(set(ids)) == 9

    failed = owner.get("/api/logs", params={"type": "verify", "outcome": "failed"}).json()["items"]
    assert len(failed) == 3 and failed[0]["errorCode"] == "incorrect-answer"

    detail = owner.get(f"/api/logs/{failed[0]['id']}").json()
    assert [step["type"] for step in detail["flow"]] == ["assess", "challenge", "verify"]

    by_token = owner.get("/api/logs", params={"q": failed[0]["token"][:8]}).json()["items"]
    assert {e["token"] for e in by_token} == {failed[0]["token"]}


def test_quota_and_usage_alerts(owner, public, emails):
    key, secret = create_key(owner)
    org_id = owner.user["organization"]["id"]
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO usage_daily (day, api_key_id, org_id, assessments, challenges_static, challenges_dynamic, "
            "verifications_passed, verifications_failed, errors, rate_limited, risk_sum, risk_count, "
            "risk_b0, risk_b1, risk_b2, risk_b3, risk_b4) "
            "VALUES (current_date, :k, :o, 0, 0, 0, 7999, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)"
        ), {"k": "seed-" + key["id"][:30], "o": org_id})

    assert owner.put("/api/quota/alerts", json={"thresholds": [80, 50], "emails": ["ops@acme-corp.com"]}).json() == \
        {"thresholds": [50, 80], "emails": ["ops@acme-corp.com"]}

    verify(public, secret, start_flow(public, key["siteKey"]), "wrong")     # 8,000th verification
    verify(public, secret, start_flow(public, key["siteKey"]), "wrong")     # alerts are sent only once

    quota = owner.get("/api/quota").json()
    assert quota["used"] == 8001 and quota["quota"] == 10000 and quota["remaining"] == 1999
    titles = [n["title"] for n in owner.get("/api/notifications").json()]
    assert titles.count("80% of monthly verifications used") == 1
    assert titles.count("50% of monthly verifications used") == 1
    assert any("ops@acme-corp.com" in e["to"] for e in emails)


def test_rate_limit_overview(owner, public):
    key, _ = create_key(owner)
    with engine.begin() as conn:
        conn.execute(text("UPDATE api_keys SET rpm_override = 2 WHERE id = :k"), {"k": key["id"]})
    for _ in range(3):
        public.post("/v1/assess", json=METRICS, headers={"X-Site-Key": key["siteKey"]})

    data = owner.get("/api/rate-limits").json()
    row = data["keys"][0]
    assess = next(e for e in row["endpoints"] if e["endpoint"] == "assess")
    assert row["limit"] == 2 and row["custom"] is True
    assert assess["peak"] == 3 and assess["throttled24h"] == 1

    r = owner.post("/api/rate-limits/increase-requests", json={"keyId": key["id"], "requestedRpm": 500,
                                                                 "reason": "Launching a big sale next week."})
    assert r.json()["status"] == "under_review"
    assert owner.get("/api/rate-limits").json()["requests"][0]["requestedRpm"] == 500


# ------------------------------------------------------------------ team & roles

def test_invite_accept_and_role_permissions(owner, emails):
    r = owner.post("/api/team/invites", json={"email": "dev@acme-corp.com", "role": "developer"}).json()
    token = r["inviteUrl"].split("token=")[1]
    assert "dev@acme-corp.com" in emails[-1]["to"]

    info = new_client().get(f"/api/auth/invites/{token}").json()
    assert info == {"email": "dev@acme-corp.com", "role": "developer", "organization": "Acme Inc"}

    dev = new_client()
    assert dev.post("/api/auth/accept-invite", json={"token": token, "name": "Dev", "password": "devpassword"}).json()["role"] == "developer"
    assert dev.post("/api/keys", json={"name": "dev-key"}).status_code == 200
    assert dev.patch("/api/settings", json={"organizationName": "Hacked"}).status_code == 403
    assert dev.post("/api/team/invites", json={"email": "x@acme-corp.com", "role": "admin"}).status_code == 403
    assert dev.get("/api/billing/invoices").status_code == 403

    members = owner.get("/api/team").json()["members"]
    dev_id = next(m["id"] for m in members if m["email"] == "dev@acme-corp.com")
    assert owner.patch(f"/api/team/{dev_id}", json={"role": "viewer"}).json()["role"] == "viewer"
    assert dev.post("/api/keys", json={"name": "blocked"}).status_code == 403
    assert owner.delete(f"/api/team/{dev_id}").status_code == 204
    assert dev.get("/api/auth/me").status_code == 401


def test_free_plan_member_limit_counts_pending_invites(owner):
    assert owner.post("/api/team/invites", json={"email": "a@acme-corp.com", "role": "viewer"}).status_code == 200
    r = owner.post("/api/team/invites", json={"email": "b@acme-corp.com", "role": "viewer"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "member_limit"


def test_owner_cannot_be_removed(owner):
    me = owner.get("/api/team").json()["members"][0]
    assert owner.delete(f"/api/team/{me['id']}").status_code == 409


# ------------------------------------------------------------------ settings & notifications

def test_settings_update(owner):
    s = owner.patch("/api/settings", json={"name": "Ada L", "timezone": "Asia/Kolkata", "organizationName": "Acme Global",
                                           "billingEmail": "Billing@Acme-Corp.com", "notifications": {"keyEvents": False}}).json()
    assert s["profile"] == {"name": "Ada L", "email": owner.email, "timezone": "Asia/Kolkata"}
    assert s["organization"]["name"] == "Acme Global" and s["organization"]["billingEmail"] == "billing@acme-corp.com"
    assert s["notifications"]["keyEvents"] is False


def test_notifications_read_all(owner):
    create_key(owner)
    assert any(not n["read"] for n in owner.get("/api/notifications").json())
    owner.post("/api/notifications/read-all")
    assert all(n["read"] for n in owner.get("/api/notifications").json())
