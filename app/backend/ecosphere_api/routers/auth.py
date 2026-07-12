from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .. import models, schemas, scoring, security
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)


def _user_payload(db: Session, user: models.User) -> dict:
    is_emp = user.role == "employee"
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "department": user.department.name if user.department else None,
        "org": ({"name": user.org.name, "ouid": user.org.ouid} if user.org else None),
        "initials": "".join(p[0] for p in user.name.split()[:2]).upper(),
        "xp": scoring.user_xp(db, user.id) if is_emp else 0,
        "points": scoring.user_balance(db, user.id) if is_emp else 0,
        "badge_count": (
            db.query(models.BadgeAward).filter_by(user_id=user.id).count() if is_emp else 0
        ),
        "rank": scoring.user_rank(db, user.id) if is_emp else None,
    }


@router.post("/login")
def login(body: schemas.LoginIn, request: Request, db: Session = Depends(get_db)):
    security.login_limiter.check(security.client_ip(request))
    user = (
        db.query(models.User)
        .filter(models.User.email == body.email.lower(), models.User.can_login.is_(True))
        .first()
    )
    # generic error either way — never reveal which part failed
    if user is None or not security.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    token = security.create_session(db, user.id)
    return {"token": token, "user": _user_payload(db, user)}


@router.post("/logout", status_code=204)
def logout(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
):
    if creds is not None:
        security.destroy_session(db, creds.credentials)
    return Response(status_code=204)


@router.get("/me")
def me(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    return _user_payload(db, user)
