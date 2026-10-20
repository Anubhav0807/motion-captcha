"""HTTP layer. Each sub-package exposes a `router`."""

from fastapi import APIRouter

from app.api import dashboard, internal, v1, webhooks

api_router = APIRouter()
api_router.include_router(v1.router)            # /v1/*        public CAPTCHA API
api_router.include_router(dashboard.router)     # /api/*       dashboard (session cookie)
api_router.include_router(webhooks.router)      # /webhooks/*  Stripe
api_router.include_router(internal.router)      # /internal/*  training data
