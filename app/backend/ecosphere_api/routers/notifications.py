from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from .. import models, security, services
from ..database import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    user: models.User = Depends(security.current_user), db: Session = Depends(get_db)
):
    rows = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(30)
        .all()
    )
    return [
        {"id": n.id, "icon": n.icon, "kind": n.kind, "text": n.text,
         "when": services.relative_when(n.created_at), "read": n.read}
        for n in rows
    ]


@router.post("/read-all", status_code=204)
def read_all(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    db.query(models.Notification).filter(
        models.Notification.user_id == user.id,
        models.Notification.read.is_(False),
    ).update({"read": True})
    db.commit()
    return Response(status_code=204)
