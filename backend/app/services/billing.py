"""Stripe integration: customers, checkout, portal, invoices and subscription sync."""

import json
import logging
from datetime import datetime, timezone

import stripe
from sqlalchemy.orm import Session

from app.core import config
from app.core.errors import ApiError
from app.core.plans import get_plan, plan_for_price, stripe_price_for
from app.models import Organization
from app.services.notifications import notify

logger = logging.getLogger("motion_captcha.billing")

stripe.api_key = config.STRIPE_SECRET_KEY

ACTIVE_STATUSES = {"active", "trialing", "past_due"}


def enabled() -> bool:
    return bool(config.STRIPE_SECRET_KEY)


def require_stripe():
    if not enabled():
        raise ApiError(503, "billing_unavailable", "Billing isn't configured on this server (STRIPE_SECRET_KEY missing).")


def _get(obj, *path):
    """Safe nested lookup on Stripe objects / dicts."""
    for part in path:
        try:
            obj = obj[part]
        except (KeyError, IndexError, TypeError):
            return None
        if obj is None:
            return None
    return obj


def _ts(value):
    return datetime.fromtimestamp(value, tz=timezone.utc) if value else None


def _stripe_error(exc):
    logger.exception("Stripe call failed")
    return ApiError(502, "stripe_error", getattr(exc, "user_message", None) or "Payment provider error.")


# ------------------------------------------------------------------ reads

def payment_method(org: Organization) -> dict | None:
    if not enabled() or not org.stripe_customer_id:
        return None
    try:
        customer = stripe.Customer.retrieve(org.stripe_customer_id, expand=["invoice_settings.default_payment_method"])
        pm = _get(customer, "invoice_settings", "default_payment_method")
        if pm is None and org.stripe_subscription_id:
            sub = stripe.Subscription.retrieve(org.stripe_subscription_id, expand=["default_payment_method"])
            pm = _get(sub, "default_payment_method")
        card = _get(pm, "card")
    except stripe.StripeError:
        logger.exception("Could not load Stripe customer")
        return None
    if not card:
        return None
    return {"brand": card["brand"], "last4": card["last4"], "expMonth": card["exp_month"], "expYear": card["exp_year"]}


def list_invoices(org: Organization) -> list[dict]:
    if not enabled() or not org.stripe_customer_id:
        return []
    try:
        result = stripe.Invoice.list(customer=org.stripe_customer_id, limit=24)
    except stripe.StripeError:
        logger.exception("Could not list invoices")
        raise ApiError(502, "stripe_error", "Couldn't load invoices from the payment provider.")
    return [
        {
            "id": inv["id"],
            "number": _get(inv, "number"),
            "status": inv["status"],
            "amount": (_get(inv, "amount_paid") if inv["status"] == "paid" else _get(inv, "amount_due") or 0) / 100,
            "currency": (inv["currency"] or "usd").upper(),
            "periodStart": _ts(_get(inv, "period_start")).isoformat() if _get(inv, "period_start") else None,
            "periodEnd": _ts(_get(inv, "period_end")).isoformat() if _get(inv, "period_end") else None,
            "createdAt": _ts(inv["created"]).isoformat(),
            "hostedUrl": _get(inv, "hosted_invoice_url"),
            "pdfUrl": _get(inv, "invoice_pdf"),
        }
        for inv in result["data"]
    ]


# ------------------------------------------------------------------ sessions

def has_active_subscription(org: Organization) -> bool:
    return bool(org.stripe_subscription_id) and org.subscription_status in ACTIVE_STATUSES


def create_checkout_url(db: Session, org: Organization, plan_id: str, fallback_email: str) -> str:
    require_stripe()
    price = stripe_price_for(plan_id)
    if not price:
        raise ApiError(400, "invalid_plan", "That plan can't be purchased.")
    try:
        if not org.stripe_customer_id:
            customer = stripe.Customer.create(
                email=org.billing_email or fallback_email,
                name=org.name,
                metadata={"org_id": org.id},
            )
            org.stripe_customer_id = customer["id"]
            db.commit()
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=org.stripe_customer_id,
            client_reference_id=org.id,
            line_items=[{"price": price, "quantity": 1}],
            subscription_data={"metadata": {"org_id": org.id}},
            allow_promotion_codes=True,
            success_url=f"{config.APP_URL}/billing?status=success",
            cancel_url=f"{config.APP_URL}/billing?status=cancelled",
        )
    except stripe.StripeError as exc:
        raise _stripe_error(exc)
    return session["url"]


def create_portal_url(org: Organization) -> str:
    require_stripe()
    if not org.stripe_customer_id:
        raise ApiError(409, "no_customer", "Choose a paid plan first.")
    try:
        session = stripe.billing_portal.Session.create(
            customer=org.stripe_customer_id,
            return_url=f"{config.APP_URL}/billing",
        )
    except stripe.StripeError as exc:
        raise _stripe_error(exc)
    return session["url"]


# ------------------------------------------------------------------ webhooks

def apply_subscription(db: Session, sub):
    """Sync plan, status and renewal date from a Stripe subscription object."""
    org = None
    org_id = _get(sub, "metadata", "org_id")
    if org_id:
        org = db.get(Organization, org_id)
    if org is None:
        org = db.query(Organization).filter(Organization.stripe_customer_id == sub["customer"]).first()
    if org is None:
        logger.warning("Subscription %s has no matching organisation", _get(sub, "id"))
        return

    previous = org.plan
    status = sub["status"]
    price_id = _get(sub, "items", "data", 0, "price", "id")
    period_end = _get(sub, "current_period_end") or _get(sub, "items", "data", 0, "current_period_end")

    org.stripe_customer_id = sub["customer"]
    org.stripe_subscription_id = sub["id"]
    org.subscription_status = status
    org.current_period_end = _ts(period_end)
    org.plan = (plan_for_price(price_id) or "free") if status in ACTIVE_STATUSES else "free"
    db.commit()

    if org.plan != previous:
        name = get_plan(org.plan)["name"]
        notify(db, org.id, f"Plan changed to {name}", f"{org.name} is now on the {name} plan.", "ok", "billing")


def parse_webhook(payload: bytes, signature: str) -> dict:
    if not config.STRIPE_WEBHOOK_SECRET:
        raise ApiError(503, "billing_unavailable", "Webhook secret not configured.")
    try:
        stripe.Webhook.construct_event(payload, signature, config.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError):
        raise ApiError(400, "invalid_signature", "Invalid Stripe signature.")
    return json.loads(payload)


def handle_event(db: Session, event: dict):
    obj = event["data"]["object"]
    kind = event["type"]

    if kind == "checkout.session.completed" and obj.get("subscription"):
        org = db.get(Organization, obj.get("client_reference_id") or "")
        if org:
            org.stripe_customer_id = obj["customer"]
            org.stripe_subscription_id = obj["subscription"]
            db.commit()
        apply_subscription(db, stripe.Subscription.retrieve(obj["subscription"]))

    elif kind in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        apply_subscription(db, obj)

    elif kind == "invoice.payment_failed":
        org = db.query(Organization).filter(Organization.stripe_customer_id == obj["customer"]).first()
        if org:
            notify(db, org.id, "Payment failed",
                   "We couldn't charge your payment method. Update it in Billing to avoid losing your plan.",
                   "danger", "billing")
