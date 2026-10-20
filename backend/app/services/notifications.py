"""In-app notifications for every member of an organisation, plus opt-in email."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import config
from app.models import Notification, User
from app.services.emailer import send_email


def notify(db: Session, org_id: str, title: str, body: str, tone: str = "info", pref: str | None = None, extra_emails=()):
    """In-app notification for every member, plus email to members who opted in."""
    users = db.scalars(select(User).where(User.org_id == org_id)).all()
    emails = list(extra_emails)
    for user in users:
        db.add(Notification(user_id=user.id, title=title, body=body, tone=tone))
        if pref and (user.notification_prefs or {}).get(pref, True):
            emails.append(user.email)
    db.commit()
    if pref:
        send_email(emails, f"[motion-captcha] {title}", f"{body}\n\nOpen your dashboard: {config.APP_URL}\n")
