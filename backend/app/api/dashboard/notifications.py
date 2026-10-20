"""In-app notifications for the signed-in user."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import Ctx, current
from app.api.dashboard.utils import iso
from app.core.database import get_db
from app.models import Notification

router = APIRouter(prefix="/notifications", tags=["Dashboard: notifications"])


@router.get("")
def list_notifications(ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == ctx.user.id)
                      .order_by(Notification.created_at.desc()).limit(30)).all()
    return [{"id": n.id, "title": n.title, "body": n.body, "tone": n.tone, "read": n.read,
             "createdAt": iso(n.created_at)} for n in rows]


@router.post("/read-all", status_code=204)
def read_all(ctx: Ctx = Depends(current), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == ctx.user.id).values(read=True))
    db.commit()
