"""Incoming webhooks from third parties."""

from fastapi import APIRouter, Depends, Header, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services import billing

router = APIRouter(prefix="/webhooks", include_in_schema=False)


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default="", alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    event = billing.parse_webhook(await request.body(), stripe_signature)
    # Stripe and DB calls are blocking; keep them off the event loop.
    await run_in_threadpool(billing.handle_event, db, event)
    return {"received": True}
