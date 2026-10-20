"""Subscription plans. Prices are USD per month; Stripe holds the authoritative price."""

from app.core import config

PLANS = {
    "free": {
        "id": "free",
        "name": "Free",
        "price": 0,
        "verifications": 10_000,      # billable verifications per calendar month
        "rpm": 60,                    # per key, per endpoint, per minute
        "retention_days": 7,          # request log retention
        "max_keys": 3,
        "max_members": 2,
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price": 29,
        "verifications": 250_000,
        "rpm": 600,
        "retention_days": 30,
        "max_keys": 25,
        "max_members": 10,
    },
    "business": {
        "id": "business",
        "name": "Business",
        "price": 199,
        "verifications": 2_000_000,
        "rpm": 3_000,
        "retention_days": 90,
        "max_keys": None,
        "max_members": None,
    },
}

PLAN_ORDER = ["free", "pro", "business"]


def get_plan(plan_id):
    return PLANS.get(plan_id) or PLANS["free"]


def stripe_price_for(plan_id):
    return {
        "pro": config.STRIPE_PRICE_PRO,
        "business": config.STRIPE_PRICE_BUSINESS,
    }.get(plan_id) or None


def plan_for_price(price_id):
    for plan_id in ("pro", "business"):
        if price_id and stripe_price_for(plan_id) == price_id:
            return plan_id
    return None
