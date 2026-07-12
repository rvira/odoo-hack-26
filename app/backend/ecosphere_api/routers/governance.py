from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, scoring, security, services
from ..database import get_db

router = APIRouter(tags=["governance"])


@router.get("/policies")
def list_policies(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    n_employees = db.query(models.User).filter(models.User.role == "employee",
                                               models.User.org_id == user.org_id).count() or 1
    my_acks = {
        (a.policy_id, a.version)
        for a in db.query(models.PolicyAck).filter(models.PolicyAck.user_id == user.id)
    }
    ack_counts = dict(
        db.query(models.PolicyAck.policy_id, func.count(models.PolicyAck.id))
        .join(models.User, models.User.id == models.PolicyAck.user_id)
        .filter(models.User.org_id == user.org_id)
        .group_by(models.PolicyAck.policy_id)
        .all()
    )
    return [
        {
            "id": p.id, "name": p.name, "version": p.version, "updated": str(p.updated),
            "ack_pct": min(100, round(100 * ack_counts.get(p.id, 0) / n_employees)),
            "acked_by_me": (p.id, p.version) in my_acks,
        }
        for p in db.query(models.Policy).filter(models.Policy.active.is_(True))
    ]


@router.post("/policies/{policy_id}/acknowledge", status_code=201)
def acknowledge(
    policy_id: int,
    request: Request,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    policy = db.get(models.Policy, policy_id)
    if policy is None:
        raise HTTPException(404, "Policy not found")
    if not policy.active:
        raise HTTPException(409, "Cannot acknowledge an archived policy")
    dup = (
        db.query(models.PolicyAck)
        .filter_by(user_id=user.id, policy_id=policy_id, version=policy.version)
        .first()
    )
    if dup:
        raise HTTPException(409, "Already acknowledged this policy version")
    db.add(models.PolicyAck(user_id=user.id, policy_id=policy_id, version=policy.version))
    db.commit()
    return {"acknowledged": True}


@router.get("/policy-acks")
def list_acks(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    if user.role == "admin":
        return [
            {"employee": a.user.name, "policy": a.policy.name, "version": a.version,
             "acknowledged_on": str(a.acknowledged_on)}
            for a in db.query(models.PolicyAck)
            .join(models.User, models.User.id == models.PolicyAck.user_id)
            .filter(models.User.org_id == user.org_id)
            .order_by(models.PolicyAck.acknowledged_on.desc()).limit(100)
        ]
    acked = {
        (a.policy_id, a.version): a
        for a in db.query(models.PolicyAck).filter(models.PolicyAck.user_id == user.id)
    }
    out = []
    for p in db.query(models.Policy).filter(models.Policy.active.is_(True)):
        done = (p.id, p.version) in acked
        out.append({
            "policy_id": p.id, "name": p.name, "version": p.version,
            "due": str(p.ack_due) if p.ack_due else "—", "done": done,
        })
    return out


@router.get("/audits")
def list_audits(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    counts = dict(
        db.query(models.ComplianceIssue.audit_id, func.count(models.ComplianceIssue.id))
        .group_by(models.ComplianceIssue.audit_id)
        .all()
    )
    return [
        {
            "id": a.id, "title": a.title, "type": a.type,
            "department": a.department.name, "auditor": a.auditor,
            "date": str(a.date), "issue_count": counts.get(a.id, 0),
            "status": a.status,
        }
        for a in db.query(models.Audit)
        .join(models.Department, models.Department.id == models.Audit.department_id)
        .filter(models.Department.org_id == user.org_id)
        .order_by(models.Audit.date.desc())
    ]


@router.get("/compliance-issues")
def list_issues(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    services.flag_overdue_issues(db)
    return [
        {
            "id": i.id, "title": i.title, "audit": i.audit.title,
            "severity": i.severity, "owner": i.owner.name,
            "due_date": str(i.due_date), "status": i.status,
        }
        for i in db.query(models.ComplianceIssue)
        .join(models.User, models.User.id == models.ComplianceIssue.owner_id)
        .filter(models.User.org_id == user.org_id)
        .order_by(models.ComplianceIssue.due_date)
    ]


@router.post("/compliance-issues", status_code=201)
def create_issue(
    body: schemas.IssueIn,
    request: Request,
    admin: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    audit = db.get(models.Audit, body.audit_id)
    if audit is None or audit.department.org_id != admin.org_id:
        raise HTTPException(422, "Unknown audit")
    owner = db.get(models.User, body.owner_id)
    if owner is None or owner.org_id != admin.org_id:
        raise HTTPException(422, "Every compliance issue must have a valid owner")
    issue = models.ComplianceIssue(
        title=body.title, audit_id=body.audit_id, severity=body.severity,
        owner_id=body.owner_id, due_date=body.due_date,
    )
    db.add(issue)
    settings = scoring.org_settings(db, admin.org_id)
    if settings.notify_compliance:
        services.notify(db, owner.id,
                        f"New compliance issue assigned to you: “{issue.title}”",
                        "📋", "gov")
    db.commit()
    return {"id": issue.id}


@router.post("/compliance-issues/{issue_id}/resolve")
def resolve_issue(
    issue_id: int,
    body: schemas.ResolveIn,
    request: Request,
    admin: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    issue = db.get(models.ComplianceIssue, issue_id)
    if issue is None or issue.owner.org_id != admin.org_id:
        raise HTTPException(404, "Issue not found")
    if issue.status == "resolved":
        raise HTTPException(409, "Issue is already resolved")
    issue.resolution = body.resolution
    issue.status = "resolved"
    db.commit()
    return {"status": issue.status}


@router.get("/certifications")
def certifications(_: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    return [
        {"id": c.id, "icon": c.icon, "name": c.name, "status": c.status,
         "status_kind": c.status_kind, "until": c.until, "next": c.next}
        for c in db.query(models.Certification)
    ]
