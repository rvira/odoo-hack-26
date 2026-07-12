from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, scoring, security, services
from ..database import get_db
from .environmental import goal_row

router = APIRouter(tags=["dashboard"])


def _activity_feed(db: Session, org_id: int) -> list[dict]:
    feed = []
    decisions = (
        db.query(models.ChallengeParticipation)
        .join(models.User, models.User.id == models.ChallengeParticipation.user_id)
        .filter(models.ChallengeParticipation.status == "approved",
                models.User.org_id == org_id)
        .order_by(models.ChallengeParticipation.decided_on.desc())
        .limit(2)
    )
    for cp in decisions:
        feed.append({"icon": "🏅", "kind": "game",
                     "text": f"{cp.user.name} completed “{cp.challenge.title}” · +{cp.xp_awarded} XP",
                     "when": str(cp.decided_on)})
    overdue = (
        db.query(models.ComplianceIssue)
        .join(models.User, models.User.id == models.ComplianceIssue.owner_id)
        .filter(models.ComplianceIssue.status == "overdue",
                models.User.org_id == org_id)
        .limit(2)
    )
    for issue in overdue:
        feed.append({"icon": "⚠️", "kind": "danger",
                     "text": f"Compliance issue overdue: “{issue.title}”",
                     "when": str(issue.due_date)})
    today = date.today()
    fleet_count = (
        db.query(models.CarbonTransaction)
        .join(models.Department, models.Department.id == models.CarbonTransaction.department_id)
        .filter(models.CarbonTransaction.source_type == "fleet",
                models.Department.org_id == org_id,
                models.CarbonTransaction.date >= date(today.year, today.month, 1))
        .count()
    )
    if fleet_count:
        feed.append({"icon": "🌍", "kind": "env",
                     "text": f"{fleet_count} carbon transactions auto-logged from Fleet this month",
                     "when": "this month"})
    acks = (
        db.query(models.PolicyAck)
        .join(models.User, models.User.id == models.PolicyAck.user_id)
        .filter(models.User.org_id == org_id)
        .order_by(models.PolicyAck.acknowledged_on.desc())
        .limit(1)
    )
    for ack in acks:
        feed.append({"icon": "✅", "kind": "soc",
                     "text": f"{ack.user.name} acknowledged “{ack.policy.name} {ack.version}”",
                     "when": str(ack.acknowledged_on)})
    return feed[:6]


def _quarter_inactive(db: Session, org_id: int) -> int:
    """Employees with zero approved participation in the last ~90 days."""
    cutoff = date.today().replace(day=1)
    cutoff = date(cutoff.year if cutoff.month > 3 else cutoff.year - 1,
                  (cutoff.month - 3) % 12 or 12, 1)
    active_csr = (
        db.query(models.Participation.user_id)
        .filter(models.Participation.completed_on >= cutoff)
    )
    active_ch = (
        db.query(models.ChallengeParticipation.user_id)
        .filter(models.ChallengeParticipation.decided_on >= cutoff)
    )
    active_ids = {r[0] for r in active_csr.all()} | {r[0] for r in active_ch.all()}
    return (
        db.query(models.User)
        .filter(models.User.role == "employee", models.User.org_id == org_id,
                models.User.id.notin_(active_ids or {0}))
        .count()
    )


def platform_alerts(db: Session) -> list[dict]:
    """Live underperformance alerts (wireframe ★ Premium) — computed from the
    stored scores at read time, no static rules table needed for the demo."""
    today = date.today()
    alerts = []
    for org in db.query(models.Organization).filter(models.Organization.active.is_(True)):
        scores = scoring.org_scores_for_month(db, today.year, today.month, org.id)
        depts = scoring.dept_scores_for_month(db, today.year, today.month, org.id)
        if not depts:
            continue
        weakest = min(depts, key=lambda d: d["total"])
        inactive = _quarter_inactive(db, org.id)
        target_txt = (f"Department: {weakest['department']} (score {weakest['total']})"
                      + (f" · Employees: {inactive} with zero participation this quarter"
                         if inactive else ""))
        if scores["overall"] < 70:
            pillar = min(("E", "Environmental"), ("S", "Social"), ("G", "Governance"),
                         key=lambda p: scores[p[0]])
            alerts.append({
                "ouid": org.ouid, "org": org.name, "severity": "high",
                "when": "this month",
                "msg": (f"Overall ESG {scores['overall']} — below the platform threshold (70); "
                        f"{pillar[1]} pillar at {scores[pillar[0]]} is the weakest."),
                "target": target_txt,
                "suggestion": (f"Scope a {pillar[1].lower()} goal to {weakest['department']}, "
                               f"launch a challenge targeting it, and auto-enrol inactive "
                               f"employees in the next CSR drive."),
            })
        elif scores["overall"] < 75 or min(scores["E"], scores["S"], scores["G"]) < 65:
            k, label = min([("E", "Environmental"), ("S", "Social"), ("G", "Governance")],
                           key=lambda p: scores[p[0]])
            alerts.append({
                "ouid": org.ouid, "org": org.name, "severity": "medium",
                "when": "this month",
                "msg": f"{label} pillar at {scores[k]} this month — below the 65 watchline.",
                "target": target_txt,
                "suggestion": (f"Review {weakest['department']}'s {label.lower()} drivers and "
                               f"set a milestone on its active goal."),
            })
    return alerts


def _super_dashboard(db: Session) -> dict:
    today = date.today()
    orgs = []
    for org in db.query(models.Organization).filter(models.Organization.active.is_(True)):
        scores = scoring.org_scores_for_month(db, today.year, today.month, org.id)
        emp = (
            db.query(func.count(models.User.id))
            .filter(models.User.role == "employee", models.User.org_id == org.id)
            .scalar()
        )
        orgs.append({"id": org.id, "ouid": org.ouid, "name": org.name,
                     "admin": org.admin_name, "employees": int(emp), **scores})
    orgs.sort(key=lambda o: -o["overall"])

    all_goals = []
    for g in (db.query(models.EnvironmentalGoal)
              .join(models.Department, models.Department.id == models.EnvironmentalGoal.department_id)
              .join(models.Organization, models.Organization.id == models.Department.org_id)):
        row = goal_row(db, g)
        row["org"] = g.department.org.name
        row["ouid"] = g.department.org.ouid
        all_goals.append(row)
    all_goals.sort(key=lambda r: r["progress"])

    platform = db.query(models.PlatformSettings).first()
    alerting_on = bool(platform and platform.alerting_enabled)
    avg = round(sum(o["overall"] for o in orgs) / len(orgs)) if orgs else 0
    return {
        "role": "super",
        "kpis": {
            "organizations": len(orgs),
            "avg_esg": avg,
            "goals_on_track": sum(1 for g in all_goals
                                  if g["status"] in ("On track", "Completed")),
            "goals_total": len(all_goals),
            "goals_at_risk": sum(1 for g in all_goals
                                 if g["status"] in ("At risk", "Missed")),
        },
        "orgs": orgs,
        "all_goals": all_goals,
        "alerting_enabled": alerting_on,
        "alerts": platform_alerts(db) if alerting_on else [],
    }


@router.get("/dashboard")
def dashboard(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    services.flag_overdue_issues(db)
    if user.role == "super":
        return _super_dashboard(db)

    if user.role == "admin":
        settings = scoring.org_settings(db, user.org_id)
        today = date.today()
        return {
            "role": "admin",
            "scores": scoring.org_scores_for_month(db, today.year, today.month, user.org_id),
            "weights": {"E": settings.weight_e, "S": settings.weight_s, "G": settings.weight_g},
            "target": settings.target_score,
            "trend": scoring.trend(db, user.org_id),
            "dept_scores": [
                {k: r[k] for k in ("department", "E", "S", "G", "total")}
                for r in scoring.dept_scores_for_month(db, today.year, today.month, user.org_id)
            ],
            "activity": _activity_feed(db, user.org_id),
        }

    my_challenges = [
        {"id": cp.id, "challenge": cp.challenge.title, "progress": cp.progress,
         "status": cp.status.replace("_", " ")}
        for cp in db.query(models.ChallengeParticipation)
        .filter(models.ChallengeParticipation.user_id == user.id,
                models.ChallengeParticipation.status.in_(["in_progress", "under_review"]))
    ]
    acked = {
        (a.policy_id, a.version)
        for a in db.query(models.PolicyAck).filter(models.PolicyAck.user_id == user.id)
    }
    pending_acks = [
        {"policy_id": p.id, "name": p.name, "version": p.version,
         "due": str(p.ack_due) if p.ack_due else "—"}
        for p in db.query(models.Policy).filter(models.Policy.active.is_(True))
        if (p.id, p.version) not in acked
    ]
    badge_total = db.query(models.Badge).count()
    return {
        "role": "employee",
        "me": {
            "xp": scoring.user_xp(db, user.id),
            "points": scoring.user_balance(db, user.id),
            "badge_count": db.query(models.BadgeAward).filter_by(user_id=user.id).count(),
            "badge_total": badge_total,
            "rank": scoring.user_rank(db, user.id),
        },
        "my_challenges": my_challenges,
        "pending_acks": pending_acks,
    }
