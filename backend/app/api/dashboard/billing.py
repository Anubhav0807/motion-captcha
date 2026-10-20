"""Plans, subscription, checkout, customer portal and invoices."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.core.database import get_db
from app.core.plans import PLANS, PLAN_ORDER, get_plan, stripe_price_for
from app.models import Organization
from app.schemas.dashboard import CheckoutIn
from app.services import billing

router = APIRouter(prefix="/billing", tags=["Dashboard: billing"])


@router.get("/plans")
def plans():
    return [{**PLANS[p], "purchasable": p == "free" or bool(stripe_price_for(p))} for p in PLAN_ORDER]


@router.get("/account")
def account(ctx: Ctx = Depends(current)):
    org = ctx.org
    return {
        "stripeEnabled": billing.enabled(),
        "plan": get_plan(org.plan),
        "subscriptionStatus": org.subscription_status,
        "currentPeriodEnd": org.current_period_end.isoformat() if org.current_period_end else None,
        "billingEmail": org.billing_email,
        "hasCustomer": bool(org.stripe_customer_id),
        "paymentMethod": billing.payment_method(org) if ctx.can("billing:read") else None,
    }


@router.post("/checkout")
def checkout(body: CheckoutIn, ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    ctx.require("billing:write")
    org = db.get(Organization, ctx.org.id)
    # Existing subscribers switch plans in the Stripe portal.
    if billing.has_active_subscription(org):
        return {"url": billing.create_portal_url(org)}
    return {"url": billing.create_checkout_url(db, org, body.plan, ctx.user.email)}


@router.post("/portal")
def portal(ctx: Ctx = Depends(current)):
    ctx.require("billing:write")
    return {"url": billing.create_portal_url(ctx.org)}


@router.get("/invoices")
def invoices(ctx: Ctx = Depends(current)):
    ctx.require("billing:read")
    return billing.list_invoices(ctx.org)
