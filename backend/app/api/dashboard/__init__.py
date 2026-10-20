"""Dashboard API, authenticated by the session cookie: /api/*"""

from fastapi import APIRouter

from app.api.dashboard import (
    auth, billing, keys, logs, notifications, quota, rate_limits, settings, team, usage,
)

router = APIRouter(prefix="/api")

for module in (auth, keys, usage, quota, rate_limits, logs, notifications, team, settings, billing):
    router.include_router(module.router)
