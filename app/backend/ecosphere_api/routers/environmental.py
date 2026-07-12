from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, scoring, security
from ..database import get_db

router = APIRouter(tags=["environmental"])

SOURCE_LABEL = {"purchase": "Purchase", "manufacturing": "Manufacturing",
                "expense": "Expense", "fleet": "Fleet"}


def _next_ref(db: Session) -> str:
    n = db.query(models.CarbonTransaction).count() + 1
    while db.query(models.CarbonTransaction).filter_by(ref=f"CT-{n:04d}").first():
        n += 1
    return f"CT-{n:04d}"


def _org_txn_query(db: Session, org_id: int):
    return (
        db.query(models.CarbonTransaction)
        .join(models.Department, models.Department.id == models.CarbonTransaction.department_id)
        .filter(models.Department.org_id == org_id)
    )


@router.get("/carbon-transactions")
def list_transactions(
    source: str | None = Query(default=None, pattern=r"^(purchase|manufacturing|expense|fleet)$"),
    user: models.User = Depends(security.require_org_user),
    db: Session = Depends(get_db),
):
    q = _org_txn_query(db, user.org_id).order_by(models.CarbonTransaction.date.desc())
    if source:
        q = q.filter(models.CarbonTransaction.source_type == source)
    return [
        {
            "id": t.id, "ref": t.ref, "source_type": t.source_type,
            "source_desc": f"{SOURCE_LABEL[t.source_type]} · {t.source_desc}",
            "department": t.department.name, "scope": t.scope,
            "quantity": t.quantity, "unit": t.unit,
            "factor_display": f"{t.factor.kgco2e_per_unit} kg/{t.factor.unit}",
            "kgco2e": round(t.kgco2e, 1), "date": str(t.date),
        }
        for t in q.limit(200)
    ]


@router.post("/carbon-transactions", status_code=201)
def create_transaction(
    body: schemas.CarbonTxnIn,
    request: Request,
    user: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    dept = db.get(models.Department, body.department_id)
    if dept is None or dept.org_id != user.org_id:
        raise HTTPException(422, "Unknown department")
    factor = db.get(models.EmissionFactor, body.emission_factor_id)
    if factor is None or not factor.active:
        raise HTTPException(422, "Unknown or inactive emission factor")
    if factor.unit != body.unit:
        raise HTTPException(
            422, f"Unit mismatch: transaction is in “{body.unit}” but the factor is per “{factor.unit}”"
        )
    if factor.scope != body.scope:
        raise HTTPException(422, "Scope must match the emission factor's scope")
    txn = models.CarbonTransaction(
        ref=_next_ref(db),
        source_type=body.source_type,
        source_desc=body.source_desc,
        department_id=body.department_id,
        scope=body.scope,
        quantity=body.quantity,
        unit=body.unit,
        emission_factor_id=factor.id,
        kgco2e=body.quantity * factor.kgco2e_per_unit,
        date=body.date,
    )
    db.add(txn)
    db.commit()
    return {"id": txn.id, "ref": txn.ref, "kgco2e": round(txn.kgco2e, 1)}


def goal_row(db: Session, g: models.EnvironmentalGoal) -> dict:
    """Live goal progress row — shared by the goals list, the reports and the
    Super Admin cross-org roll-up."""
    actual_kg = (
        db.query(func.coalesce(func.sum(models.CarbonTransaction.kgco2e), 0.0))
        .filter(
            models.CarbonTransaction.department_id == g.department_id,
            models.CarbonTransaction.date >= g.created,
        )
        .scalar()
    )
    current_t = actual_kg / 1000
    total_days = max(1, (g.deadline - g.created).days)
    elapsed = min(1.0, max(0.0, (date.today() - g.created).days / total_days))
    expected = g.target_value * elapsed if elapsed > 0 else g.target_value
    # progress = how far consumption tracks the prorated budget; overshoot is
    # measured against what should have been spent by now, so a goal running
    # 20% hot reads 80, not 95.
    over = max(0.0, current_t - expected)
    progress = round(scoring.clamp(100 * (1 - over / max(expected, g.target_value * 0.05))))
    if date.today() > g.deadline:
        status = ("Completed", "env") if current_t <= g.target_value else ("Missed", "danger")
    elif current_t <= expected * 1.05:
        status = ("On track", "env")
    else:
        status = ("At risk", "game")
    return {
        "id": g.id, "name": g.name, "department": g.department.name,
        "target_value": g.target_value, "current_value": round(current_t, 1),
        "progress": progress, "deadline": str(g.deadline),
        "status": status[0], "status_kind": status[1],
    }


@router.get("/goals")
def list_goals(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    q = (
        db.query(models.EnvironmentalGoal)
        .join(models.Department, models.Department.id == models.EnvironmentalGoal.department_id)
        .filter(models.Department.org_id == user.org_id)
        .order_by(models.EnvironmentalGoal.deadline)
    )
    return [goal_row(db, g) for g in q]


@router.post("/goals", status_code=201)
def create_goal(
    body: schemas.GoalIn,
    request: Request,
    user: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    dept = db.get(models.Department, body.department_id)
    if dept is None or dept.org_id != user.org_id:
        raise HTTPException(422, "Unknown department")
    goal = models.EnvironmentalGoal(
        name=body.name, department_id=body.department_id,
        target_value=body.target_value, deadline=body.deadline,
    )
    db.add(goal)
    db.commit()
    return {"id": goal.id}


@router.get("/environmental/summary")
def env_summary(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    org_id = user.org_id
    today = date.today()
    year_start = date(today.year, 1, 1)

    def org_sum(*filters):
        return (
            db.query(func.coalesce(func.sum(models.CarbonTransaction.kgco2e), 0.0))
            .join(models.Department, models.Department.id == models.CarbonTransaction.department_id)
            .filter(models.Department.org_id == org_id, *filters)
            .scalar()
        )

    ytd_kg = org_sum(models.CarbonTransaction.date >= year_start)
    total_budget_t = (
        db.query(func.coalesce(func.sum(models.EnvironmentalGoal.target_value), 0.0))
        .join(models.Department, models.Department.id == models.EnvironmentalGoal.department_id)
        .filter(models.Department.org_id == org_id,
                models.EnvironmentalGoal.deadline >= year_start)
        .scalar()
    )
    headcount = (
        db.query(models.User)
        .filter(models.User.role == "employee", models.User.org_id == org_id)
        .count()
    ) or 1

    months = scoring.last_12_months()
    monthly, labels = [], []
    for y, m in months:
        start, end = scoring.month_bounds(y, m)
        kg = org_sum(models.CarbonTransaction.date >= start,
                     models.CarbonTransaction.date <= end)
        monthly.append(round(kg / 1000, 1))
        labels.append(scoring.MONTH_LABELS[m - 1])

    scope_rows = (
        db.query(models.CarbonTransaction.scope,
                 func.sum(models.CarbonTransaction.kgco2e))
        .join(models.Department, models.Department.id == models.CarbonTransaction.department_id)
        .filter(models.Department.org_id == org_id,
                models.CarbonTransaction.date >= year_start)
        .group_by(models.CarbonTransaction.scope)
        .all()
    )
    scope_total = sum(kg for _, kg in scope_rows) or 1
    scope_label = {1: "Scope 1 · Direct (own fuel & fleet)", 2: "Scope 2 · Energy (purchased electricity)",
                   3: "Scope 3 · Value chain (suppliers & travel)"}
    by_scope = [
        {"scope": s, "label": scope_label[s], "tonnes": round(kg / 1000, 1),
         "pct": round(100 * kg / scope_total)}
        for s, kg in sorted(scope_rows)
    ]

    dept_rows = (
        db.query(models.Department.name, models.CarbonTransaction.source_type,
                 func.sum(models.CarbonTransaction.kgco2e))
        .join(models.Department, models.Department.id == models.CarbonTransaction.department_id)
        .filter(models.Department.org_id == org_id,
                models.CarbonTransaction.date >= year_start)
        .group_by(models.Department.name, models.CarbonTransaction.source_type)
        .all()
    )
    breakdown: dict[str, dict] = {}
    for dept, src, kg in dept_rows:
        row = breakdown.setdefault(
            dept, {"department": dept, "fleet": 0.0, "purchase": 0.0,
                   "manufacturing": 0.0, "expense": 0.0, "total": 0.0})
        row[src] = round(kg / 1000, 1)
        row["total"] = round(row["total"] + kg / 1000, 1)

    return {
        "ytd_tonnes": round(ytd_kg / 1000, 1),
        "vs_target_pct": round(100 * (ytd_kg / 1000) / total_budget_t) if total_budget_t else None,
        "intensity": round(ytd_kg / 1000 / headcount, 2),
        "monthly": monthly, "months": labels,
        "by_scope": by_scope,
        "dept_breakdown": sorted(breakdown.values(), key=lambda r: -r["total"]),
    }


@router.get("/products")
def products(_: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    out = []
    for p in db.query(models.ProductProfile).order_by(models.ProductProfile.sku):
        effective = p.co2_per_unit * (p.weightage or 1.0)
        rating = "A" if effective < 1 else "B" if effective < 4 else "C"
        out.append({
            "id": p.id, "sku": p.sku, "name": p.name,
            "co2_per_unit": p.co2_per_unit, "weightage": p.weightage,
            "recyclable_pct": p.recyclable_pct, "rating": rating,
        })
    return out
