"""Outgoing email over SMTP. Without SMTP_HOST configured, messages are logged instead."""

import logging
import smtplib
import threading
from email.message import EmailMessage

from app.core import config

logger = logging.getLogger("motion_captcha.email")


def _send(to: list[str], subject: str, body: str):
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)

    if not config.SMTP_HOST:
        logger.warning("SMTP not configured - email not sent.\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
        return

    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
            if config.SMTP_STARTTLS:
                smtp.starttls()
            if config.SMTP_USER:
                smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
            smtp.send_message(msg)
    except Exception:
        logger.exception("Failed to send email to %s", to)


def send_email(to, subject: str, body: str):
    """Send in a background thread so API responses never wait on SMTP."""
    recipients = [to] if isinstance(to, str) else [r for r in dict.fromkeys(to) if r]
    if not recipients:
        return
    threading.Thread(target=_send, args=(recipients, subject, body), daemon=True).start()
