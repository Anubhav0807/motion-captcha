"""Serves the drop-in browser widget (app/static/widget.js)."""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(include_in_schema=False)

WIDGET_PATH = Path(__file__).resolve().parents[2] / "static" / "widget.js"


@router.get("/widget.js")
def widget():
    return FileResponse(
        WIDGET_PATH,
        media_type="application/javascript",
        headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"},
    )
