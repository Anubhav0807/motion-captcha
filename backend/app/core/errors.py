"""One error format for the whole API: {"error": {"code", "message"}}."""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("motion_captcha")


class ApiError(HTTPException):
    """Raise this from any route; it's rendered as {"error": {"code", "message"}}."""

    def __init__(self, status_code: int, code: str, message: str, headers: dict | None = None):
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code


def register_exception_handlers(app: FastAPI):
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        code = getattr(exc, "code", None) or {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "error")
        return JSONResponse(
            {"error": {"code": code, "message": str(exc.detail)}},
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        errors = exc.errors()
        first = errors[0] if errors else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:])
        message = first.get("msg", "Invalid request").removeprefix("Value error, ")
        return JSONResponse(
            {
                "error": {
                    "code": "invalid_request",
                    "message": f"{field}: {message}" if field else message,
                    "fields": [{"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg")} for e in errors],
                }
            },
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"error": {"code": "internal_error", "message": "Internal server error."}}, status_code=500)
