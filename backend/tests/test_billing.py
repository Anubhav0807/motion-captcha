"""Plans and Stripe webhooks (no network calls: Stripe API key is unset in tests)."""

import hashlib
import hmac
import json
import time

from sqlalchemy import text

from app.core.database import engine


def _send(client, event, secret=b"whsec_test", valid=True):
    body = json.dumps(event)
    ts = int(time.time())
    sig = hmac.new(secret, f"{ts}.{body}".encode(), hashlib.sha256).hexdigest() if valid else "bad"
    return client.post("/webhooks/stripe", content=body,
                       headers={"Stripe-Signature": f"t={ts},v1={sig}", "content-type": "application/json"})


def _subscription_event(org_id, customer, status="active", price="price_pro", kind="customer.subscription.updated"):
    return {"id": "evt_test", "type": kind, "data": {"object": {
        "id": "sub_test", "customer": customer, "status": status, "metadata": {"org_id": org_id},
        "items": {"data": [{"price": {"id": price}, "current_period_end": int(time.time()) + 30 * 86400}]},
    }}}


def test_plans_listing(public):
    plans = public.get("/api/billing/plans").json()
    assert [p["id"] for p in plans] == ["free", "pro", "business"]
    assert all(p["purchasable"] for p in plans)


def test_billing_without_stripe(owner):
    account = owner.get("/api/billing/account").json()
    assert account["stripeEnabled"] is False and account["plan"]["id"] == "free"
    r = owner.post("/api/billing/checkout", json={"plan": "pro"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing_unavailable"
    assert owner.get("/api/billing/invoices").json() == []


def test_webhook_signature_is_checked(public):
    assert _send(public, {"type": "ping", "data": {"object": {}}}, valid=False).status_code == 400


def test_subscription_webhooks_change_plan(owner, public):
    org_id = owner.user["organization"]["id"]
    customer = "cus_" + org_id[:8]
    with engine.begin() as conn:
        conn.execute(text("UPDATE organizations SET stripe_customer_id = :c WHERE id = :o"), {"c": customer, "o": org_id})

    assert _send(public, _subscription_event(org_id, customer)).status_code == 200
    me = owner.get("/api/auth/me").json()
    account = owner.get("/api/billing/account").json()
    assert me["organization"]["plan"] == "pro"
    assert account["subscriptionStatus"] == "active" and account["currentPeriodEnd"]

    _send(public, _subscription_event(org_id, customer, price="price_business"))
    assert owner.get("/api/auth/me").json()["organization"]["plan"] == "business"

    _send(public, _subscription_event(org_id, customer, status="canceled", kind="customer.subscription.deleted"))
    assert owner.get("/api/auth/me").json()["organization"]["plan"] == "free"

    titles = [n["title"] for n in owner.get("/api/notifications").json()]
    assert {"Plan changed to Pro", "Plan changed to Business", "Plan changed to Free"} <= set(titles)


def test_payment_failed_notifies(owner, public):
    org_id = owner.user["organization"]["id"]
    customer = "cus_pf_" + org_id[:8]
    with engine.begin() as conn:
        conn.execute(text("UPDATE organizations SET stripe_customer_id = :c WHERE id = :o"), {"c": customer, "o": org_id})
    _send(public, {"type": "invoice.payment_failed", "data": {"object": {"customer": customer}}})
    assert owner.get("/api/notifications").json()[0]["title"] == "Payment failed"
