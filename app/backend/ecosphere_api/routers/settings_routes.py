from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, scoring, security
from ..database import get_db

router = APIRouter(tags=["settings"])


@router.get("/employees")
def list_employees(admin: models.User = Depends(security.require_admin), db: Session = Depends(get_db)):
    """Minimal directory for admin pickers (issue ownership) — no HR attributes."""
    return [
        {"id": u.id, "name": u.name,
         "department": u.department.name if u.department else None}
        for u in db.query(models.User).filter(models.User.role == "employee",
                                              models.User.org_id == admin.org_id)
        .order_by(models.User.name)
    ]


@router.get("/departments")
def list_departments(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    counts = dict(
        db.query(models.User.department_id, func.count(models.User.id))
        .filter(models.User.role == "employee", models.User.org_id == user.org_id)
        .group_by(models.User.department_id)
        .all()
    )
    return [
        {
            "id": d.id, "name": d.name, "code": d.code, "head": d.head,
            "parent": d.parent.name if d.parent else None,
            "employee_count": counts.get(d.id, 0), "active": d.active,
        }
        for d in db.query(models.Department).filter(models.Department.org_id == user.org_id)
        .order_by(models.Department.name)
    ]


@router.post("/departments", status_code=201)
def create_department(
    body: schemas.DepartmentIn,
    request: Request,
    admin: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    code = body.code.upper()
    dup = (db.query(models.Department)
           .filter(func.upper(models.Department.code) == code,
                   models.Department.org_id == admin.org_id).first())
    if dup:
        raise HTTPException(409, f"Department code “{code}” already exists")
    if body.parent_id is not None:
        parent = db.get(models.Department, body.parent_id)
        if parent is None or parent.org_id != admin.org_id:
            raise HTTPException(422, "Unknown parent department")
    dept = models.Department(name=body.name, code=code, head=body.head,
                             parent_id=body.parent_id, org_id=admin.org_id)
    db.add(dept)
    db.commit()
    return {"id": dept.id}


@router.get("/categories")
def list_categories(_: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    return [
        {"id": c.id, "name": c.name, "type": c.type}
        for c in db.query(models.Category).filter(models.Category.active.is_(True))
        .order_by(models.Category.type, models.Category.name)
    ]


@router.post("/categories", status_code=201)
def create_category(
    body: schemas.CategoryIn,
    request: Request,
    _: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    dup = db.query(models.Category).filter_by(name=body.name, type=body.type).first()
    if dup:
        raise HTTPException(409, "That category already exists")
    cat = models.Category(name=body.name, type=body.type)
    db.add(cat)
    db.commit()
    return {"id": cat.id}


@router.get("/emission-factors")
def list_factors(_: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    return [
        {"id": f.id, "name": f.name, "scope": f.scope, "unit": f.unit,
         "kgco2e_per_unit": f.kgco2e_per_unit, "source": f.source}
        for f in db.query(models.EmissionFactor).filter(models.EmissionFactor.active.is_(True))
        .order_by(models.EmissionFactor.scope)
    ]


@router.post("/emission-factors", status_code=201)
def create_factor(
    body: schemas.FactorIn,
    request: Request,
    _: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    dup = (
        db.query(models.EmissionFactor)
        .filter_by(name=body.name, scope=body.scope, unit=body.unit)
        .first()
    )
    if dup:
        raise HTTPException(409, "A factor with that name, scope and unit already exists")
    f = models.EmissionFactor(**body.model_dump())
    db.add(f)
    db.commit()
    return {"id": f.id}


def _settings_payload(s: models.OrgSettings) -> dict:
    return {
        "weights": {"E": s.weight_e, "S": s.weight_s, "G": s.weight_g},
        "toggles": {
            "auto_emission": s.auto_emission,
            "evidence_required": s.evidence_required,
            "badge_auto_award": s.badge_auto_award,
            "overdue_flagging": s.overdue_flagging,
            "notify_compliance": s.notify_compliance,
            "notify_decisions": s.notify_decisions,
            "notify_ack_reminders": s.notify_ack_reminders,
            "notify_badges": s.notify_badges,
        },
    }


@router.get("/settings")
def get_settings(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    return _settings_payload(scoring.org_settings(db, user.org_id))


@router.put("/settings")
def update_settings(
    body: schemas.SettingsIn,
    request: Request,
    admin: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    w = body.weights
    if w.E + w.S + w.G != 100:
        raise HTTPException(
            422, f"Score weights must sum to exactly 100 (currently {w.E + w.S + w.G})"
        )
    s = scoring.org_settings(db, admin.org_id)
    s.weight_e, s.weight_s, s.weight_g = w.E, w.S, w.G
    t = body.toggles
    s.auto_emission = t.auto_emission
    s.evidence_required = t.evidence_required
    s.badge_auto_award = t.badge_auto_award
    s.overdue_flagging = t.overdue_flagging
    s.notify_compliance = t.notify_compliance
    s.notify_decisions = t.notify_decisions
    s.notify_ack_reminders = t.notify_ack_reminders
    s.notify_badges = t.notify_badges
    db.commit()
    return _settings_payload(s)
