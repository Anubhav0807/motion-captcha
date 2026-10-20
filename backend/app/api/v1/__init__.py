"""Public, versioned CAPTCHA API: /v1/*"""

from fastapi import APIRouter

from app.api.v1 import captcha, widget

router = APIRouter(prefix="/v1")
router.include_router(captcha.router)
router.include_router(widget.router)
