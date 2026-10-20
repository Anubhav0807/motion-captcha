"""
motion-captcha API.

    uvicorn app.main:app --reload --port 8000
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.api import api_router
from app.core import config
from app.core.database import Base, engine
from app.core.errors import ApiError, register_exception_handlers
from app.services.maintenance import maintenance_loop
from app.services.risk_model import load_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.validate()
    # Create any missing tables. Existing training tables are left untouched.
    Base.metadata.create_all(bind=engine)
    load_model()
    task = asyncio.create_task(maintenance_loop())
    yield
    task.cancel()


def _mount_dashboard(application: FastAPI, dist: str):
    """Serve the built React dashboard from the same origin as /api (cookie auth needs that)."""
    dist = os.path.abspath(dist)
    index_html = os.path.join(dist, "index.html")
    application.mount("/assets", StaticFiles(directory=os.path.join(dist, "assets")), name="assets")

    @application.get("/{path:path}", include_in_schema=False)
    def dashboard(path: str):
        if path.startswith(("api/", "v1/", "internal/", "webhooks/")):
            raise ApiError(404, "not_found", "Not found.")
        candidate = os.path.abspath(os.path.join(dist, path))
        if path and candidate.startswith(dist + os.sep) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(index_html, headers={"Cache-Control": "no-cache"})


def create_app() -> FastAPI:
    application = FastAPI(title="motion-captcha API", version="1.0.0", lifespan=lifespan, docs_url="/docs", redoc_url=None)

    # The public API is called from customers' sites, so any origin may call it.
    # Credentials are NOT allowed cross-origin, so the dashboard's session cookie
    # only works same-origin (serve the dashboard from this API or behind one proxy).
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Site-Key"],
        max_age=86400,
    )
    register_exception_handlers(application)

    @application.get("/health", tags=["Health"])
    def health():
        return {"status": "ok", "service": "motion-captcha"}

    application.include_router(api_router)

    if config.DASHBOARD_DIST and os.path.isdir(config.DASHBOARD_DIST):
        _mount_dashboard(application, config.DASHBOARD_DIST)

    return application


app = create_app()
