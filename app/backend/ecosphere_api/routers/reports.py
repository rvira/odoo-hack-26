import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, scoring, security
from ..database import get_db
from .environmental import env_summary
from .social import diversity

router = APIRouter(prefix="/reports", tags=["reports"])


def _summary(db: Session, org_id: int) -> dict:
    today = date.today()
    return {
        "scores": scoring.org_scores_for_month(db, today.year, today.month, org_id),
        "dept_scores": [
            {k: r[k] for k in ("department", "E", "S", "G", "total")}
            for r in scoring.dept_scores_for_month(db, today.year, today.month, org_id)
        ],
    }


def _social_metrics(db: Session, user: models.User) -> list[list]:
    div = diversity(user, db)
    base = (db.query(models.Participation)
            .join(models.User, models.User.id == models.Participation.user_id)
            .filter(models.User.org_id == user.org_id))
    total_p = base.count()
    approved = base.filter(models.Participation.status == "approved").count()
    training = div["training"]
    avg_training = round(sum(t[1] for t in training) / len(training)) if training else 0
    repr_map = dict(div["representation"])
    return [
        ["Women in workforce", f"{repr_map.get('Women in workforce', 0)}%"],
        ["Women in leadership", f"{repr_map.get('Women in leadership', 0)}%"],
        ["Training completion", f"{avg_training}%"],
        ["CSR participations", str(total_p)],
        ["CSR approval rate", f"{round(100 * approved / total_p) if total_p else 0}%"],
    ]


def _governance_metrics(db: Session, org_id: int) -> list[list]:
    n_emp = db.query(models.User).filter(models.User.role == "employee",
                                         models.User.org_id == org_id).count() or 1
    n_pol = db.query(models.Policy).filter(models.Policy.active.is_(True)).count() or 1
    acks = (db.query(models.PolicyAck)
            .join(models.User, models.User.id == models.PolicyAck.user_id)
            .filter(models.User.org_id == org_id).count())
    issues = (db.query(models.ComplianceIssue)
              .join(models.User, models.User.id == models.ComplianceIssue.owner_id)
              .filter(models.User.org_id == org_id))
    open_issues = issues.filter(models.ComplianceIssue.status != "resolved").count()
    overdue = issues.filter(models.ComplianceIssue.status == "overdue").count()
    resolved = issues.filter(models.ComplianceIssue.status == "resolved").count()
    audits = (db.query(models.Audit)
              .join(models.Department, models.Department.id == models.Audit.department_id)
              .filter(models.Department.org_id == org_id).count())
    return [
        ["Policy acknowledgement", f"{min(100, round(100 * acks / (n_emp * n_pol)))}%"],
        ["Audits on record", str(audits)],
        ["Open compliance issues", f"{open_issues} ({overdue} overdue)"],
        ["Resolved issues", str(resolved)],
        ["Active policies", str(n_pol)],
    ]


@router.get("/summary")
def report_summary(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    return _summary(db, user.org_id)


@router.get("/environmental")
def report_environmental(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    summary = env_summary(user, db)
    return {"by_scope": summary["by_scope"]}


@router.get("/social")
def report_social(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    return {"metrics": _social_metrics(db, user)}


@router.get("/governance")
def report_governance(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    return {"metrics": _governance_metrics(db, user.org_id)}


@router.post("/builder")
def builder(
    body: schemas.BuilderIn,
    user: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    rows: list[dict] = []
    want = lambda module: body.module is None or body.module == module

    if want("environmental"):
        q = (db.query(models.CarbonTransaction)
             .join(models.Department, models.Department.id == models.CarbonTransaction.department_id)
             .filter(models.Department.org_id == user.org_id))
        if body.department_id:
            q = q.filter(models.CarbonTransaction.department_id == body.department_id)
        if body.date_from:
            q = q.filter(models.CarbonTransaction.date >= body.date_from)
        if body.date_to:
            q = q.filter(models.CarbonTransaction.date <= body.date_to)
        for t in q.order_by(models.CarbonTransaction.date.desc()).limit(50):
            rows.append({"date": str(t.date), "department": t.department.name,
                         "module": "Environmental", "metric": f"{t.ref} · {t.source_desc}",
                         "value": f"{round(t.kgco2e):,} kg CO₂e"})
    if want("social"):
        q = (db.query(models.Participation)
             .join(models.User, models.User.id == models.Participation.user_id)
             .filter(models.Participation.status == "approved",
                     models.User.org_id == user.org_id))
        if body.department_id:
            q = q.filter(models.User.department_id == body.department_id)
        if body.date_from:
            q = q.filter(models.Participation.completed_on >= body.date_from)
        if body.date_to:
            q = q.filter(models.Participation.completed_on <= body.date_to)
        for p in q.limit(50):
            rows.append({"date": str(p.completed_on),
                         "department": p.user.department.name if p.user.department else "—",
                         "module": "Social", "metric": f"CSR · {p.activity.name}",
                         "value": f"+{p.points_earned} pts"})
    if want("governance"):
        q = (db.query(models.PolicyAck)
             .join(models.User, models.User.id == models.PolicyAck.user_id)
             .filter(models.User.org_id == user.org_id))
        if body.department_id:
            q = q.filter(models.User.department_id == body.department_id)
        if body.date_from:
            q = q.filter(models.PolicyAck.acknowledged_on >= body.date_from)
        if body.date_to:
            q = q.filter(models.PolicyAck.acknowledged_on <= body.date_to)
        for a in q.limit(50):
            rows.append({"date": str(a.acknowledged_on),
                         "department": a.user.department.name if a.user.department else "—",
                         "module": "Governance", "metric": f"Policy ack · {a.policy.name}",
                         "value": a.version})
    if want("gamification"):
        q = (db.query(models.ChallengeParticipation)
             .join(models.User, models.User.id == models.ChallengeParticipation.user_id)
             .filter(models.ChallengeParticipation.status == "approved",
                     models.User.org_id == user.org_id))
        if body.department_id:
            q = q.filter(models.User.department_id == body.department_id)
        if body.date_from:
            q = q.filter(models.ChallengeParticipation.decided_on >= body.date_from)
        if body.date_to:
            q = q.filter(models.ChallengeParticipation.decided_on <= body.date_to)
        for cp in q.limit(50):
            rows.append({"date": str(cp.decided_on),
                         "department": cp.user.department.name if cp.user.department else "—",
                         "module": "Gamification", "metric": f"Challenge · {cp.challenge.title}",
                         "value": f"+{cp.xp_awarded} XP"})

    rows.sort(key=lambda r: r["date"], reverse=True)
    return {"rows": rows[:100]}


@router.get("/{kind}/export")
def export_report(
    kind: str,
    format: str = "csv",
    user: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    if format != "csv":
        raise HTTPException(422, "Only CSV export is supported")
    buf = io.StringIO()
    writer = csv.writer(buf)
    if kind == "summary":
        writer.writerow(["Department", "Environmental", "Social", "Governance", "Total"])
        for r in _summary(db, user.org_id)["dept_scores"]:
            writer.writerow([r["department"], r["E"], r["S"], r["G"], r["total"]])
    elif kind == "environmental":
        writer.writerow(["Scope", "Tonnes CO2e (YTD)", "Share %"])
        for r in env_summary(user, db)["by_scope"]:
            writer.writerow([r["label"], r["tonnes"], r["pct"]])
    elif kind == "social":
        writer.writerow(["Metric", "Value"])
        writer.writerows(_social_metrics(db, user))
    elif kind == "governance":
        writer.writerow(["Metric", "Value"])
        writer.writerows(_governance_metrics(db, user.org_id))
    else:
        raise HTTPException(404, "Unknown report")
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="ecosphere-{kind}.csv"'},
    )
