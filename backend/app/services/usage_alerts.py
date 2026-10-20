"""Monthly quota alerts (e.g. 50% / 80% / 100% of included verifications)."""

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.plans import get_plan
from app.models import AlertSent, Organization
from app.services.metering import month_start, month_verifications
from app.services.notifications import notify


def check_usage_alerts(db: Session, org: Organization):
    """Send each configured threshold alert at most once per calendar month."""
    quota = get_plan(org.plan)["verifications"]
    used = month_verifications(db, org.id)
    period = month_start().strftime("%Y-%m")

    for threshold in sorted(org.alert_thresholds or []):
        if used < quota * threshold / 100:
            break
        inserted = db.execute(
            pg_insert(AlertSent)
            .values(org_id=org.id, period=period, threshold=threshold)
            .on_conflict_do_nothing()
            .returning(AlertSent.threshold)
        ).scalar_one_or_none()
        db.commit()
        if inserted is not None:
            over = threshold >= 100
            notify(
                db,
                org.id,
                f"{threshold}% of monthly verifications used",
                (
                    f"{org.name} has used {used:,} of {quota:,} verifications this month. "
                    + ("New challenges are paused until next month or until you upgrade." if over
                       else "Consider upgrading before you reach the limit.")
                ),
                tone="danger" if over else "warn",
                pref="usageAlerts",
                extra_emails=org.alert_emails or [],
            )
