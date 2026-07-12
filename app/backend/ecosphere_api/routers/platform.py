"""Platform-tier endpoints (Super Admin only) — read-scoped cross-org views
plus two write actions: the alerting master switch and sending an intervention
suggestion into an org admin's notification inbox (wireframe behaviour)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas, security, services
from ..database import get_db

router = APIRouter(prefix="/platform", tags=["platform"])


@router.post("/suggestions", status_code=201)
def send_suggestion(
    body: schemas.SuggestionIn,
    request: Request,
    _: models.User = Depends(security.require_super),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    org = db.query(models.Organization).filter(models.Organization.ouid == body.ouid).first()
    if org is None:
        raise HTTPException(404, "Unknown organization")
    services.notify_admins(db, org.id,
                           f"Suggestion from Super Admin: {body.message}", "📬", "gov")
    db.commit()
    return {"sent_to": org.name}


@router.put("/alerting")
def set_alerting(
    body: schemas.AlertingIn,
    request: Request,
    _: models.User = Depends(security.require_super),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    settings = db.query(models.PlatformSettings).first()
    if settings is None:
        settings = models.PlatformSettings()
        db.add(settings)
    settings.alerting_enabled = body.enabled
    db.commit()
    return {"alerting_enabled": settings.alerting_enabled}
