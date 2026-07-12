from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, scoring, security, services
from ..database import UPLOAD_DIR, get_db

PROOF_MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".pdf": "application/pdf"}


def serve_proof(stored: str | None):
    """Stream a stored proof file. `stored` is always server-generated
    (token_hex + allow-listed extension) — never a client-supplied path."""
    if not stored:
        raise HTTPException(404, "No proof file attached")
    path = UPLOAD_DIR / stored
    if not path.is_file():
        raise HTTPException(404, "Proof file not found")
    media = PROOF_MEDIA.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=media,
                        headers={"Content-Disposition": f'inline; filename="{stored}"'})

router = APIRouter(tags=["social"])


@router.get("/csr-activities")
def list_activities(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    joined = {
        p.activity_id
        for p in db.query(models.Participation).filter(models.Participation.user_id == user.id)
    }
    counts = dict(
        db.query(models.Participation.activity_id, func.count(models.Participation.id))
        .group_by(models.Participation.activity_id)
        .all()
    )
    return [
        {
            "id": a.id, "name": a.name, "category": a.category.name,
            "when": a.when_label, "points": a.points,
            "evidence_required": a.evidence_required,
            "joined_count": counts.get(a.id, 0),
            "joined_by_me": a.id in joined,
        }
        for a in db.query(models.CsrActivity).filter(models.CsrActivity.active.is_(True))
    ]


@router.post("/csr-activities/{activity_id}/join", status_code=201)
def join_activity(
    activity_id: int,
    request: Request,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    activity = db.get(models.CsrActivity, activity_id)
    if activity is None or not activity.active:
        raise HTTPException(404, "Activity not found")
    dup = (
        db.query(models.Participation)
        .filter_by(user_id=user.id, activity_id=activity_id)
        .first()
    )
    if dup:
        raise HTTPException(409, "You already joined this activity")
    p = models.Participation(user_id=user.id, activity_id=activity_id,
                             completed_on=date.today())
    db.add(p)
    db.commit()
    return {"id": p.id, "status": p.status}


@router.get("/participations")
def list_participations(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    q = db.query(models.Participation).order_by(models.Participation.id.desc())
    if user.role == "admin":
        q = q.join(models.User, models.User.id == models.Participation.user_id).filter(
            models.User.org_id == user.org_id)  # own org only
    else:
        q = q.filter(models.Participation.user_id == user.id)  # own records only
    rows = []
    for p in q.limit(100):
        row = {
            "id": p.id, "activity": p.activity.name,
            "completed": str(p.completed_on), "proof": p.proof_name,
            "proof_method": p.proof_method,
            "points": p.points_earned or p.activity.points, "status": p.status,
        }
        if user.role == "admin":
            row["employee"] = p.user.name
        rows.append(row)
    return rows


def _get_own_participation(db: Session, pid: int, user: models.User) -> models.Participation:
    p = db.get(models.Participation, pid)
    if p is None:
        raise HTTPException(404, "Participation not found")
    if user.role != "admin" and p.user_id != user.id:
        raise HTTPException(403, "Not your participation")
    return p


@router.post("/participations/{pid}/proof")
async def upload_proof(
    pid: int,
    request: Request,
    file: UploadFile = File(...),
    method: str = Form("upload"),
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    if method not in ("upload", "capture"):
        raise HTTPException(422, "method must be 'upload' or 'capture'")
    p = _get_own_participation(db, pid, user)
    if p.status != "pending":
        raise HTTPException(409, "Only pending participations accept proof")
    p.proof_name, p.proof_stored = await services.store_proof(file)
    p.proof_method = method
    db.commit()
    return {"proof": p.proof_name}


def _decide(db: Session, p: models.Participation, approve: bool) -> None:
    settings = scoring.org_settings(db, p.user.org_id)
    if p.status != "pending":
        raise HTTPException(409, "Participation was already decided")
    if approve:
        evidence_needed = settings.evidence_required or p.activity.evidence_required
        if evidence_needed and not p.proof_stored:
            raise HTTPException(
                409, "Evidence Requirement is ON — attach a proof file before approving"
            )
        p.status = "approved"
        p.points_earned = p.activity.points
    else:
        p.status = "rejected"
        p.points_earned = 0
    p.decided_on = date.today()
    if settings.notify_decisions:
        verdict = f"approved · +{p.points_earned} pts" if approve else "rejected"
        services.notify(db, p.user_id,
                        f"Your “{p.activity.name}” participation was {verdict}",
                        "✅" if approve else "❌", "soc")
    if approve:
        services.check_badges(db, p.user_id)
    db.commit()


@router.get("/participations/{pid}/proof-file")
def participation_proof(
    pid: int,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    p = _get_own_participation(db, pid, user)
    if user.role == "admin" and p.user.org_id != user.org_id:
        raise HTTPException(403, "Not your organization")
    return serve_proof(p.proof_stored)


def _admin_participation(db: Session, pid: int, admin: models.User) -> models.Participation:
    p = db.get(models.Participation, pid)
    if p is None or p.user.org_id != admin.org_id:
        raise HTTPException(404, "Participation not found")
    return p


@router.post("/participations/{pid}/approve")
def approve_participation(
    pid: int, request: Request,
    admin: models.User = Depends(security.require_admin), db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    p = _admin_participation(db, pid, admin)
    _decide(db, p, approve=True)
    return {"status": p.status, "points": p.points_earned}


@router.post("/participations/{pid}/reject")
def reject_participation(
    pid: int, request: Request,
    admin: models.User = Depends(security.require_admin), db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    p = _admin_participation(db, pid, admin)
    _decide(db, p, approve=False)
    return {"status": p.status}


@router.get("/social/diversity")
def diversity(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    """Aggregate-only diversity metrics — no per-person sensitive data leaves the DB."""
    employees = db.query(models.User).filter(models.User.role == "employee",
                                             models.User.org_id == user.org_id).all()
    n = len(employees) or 1
    women = sum(1 for u in employees if u.gender == "female")
    leaders = [u for u in employees if u.is_leadership] or [None]
    women_lead = sum(1 for u in leaders if u and u.gender == "female")
    pct = lambda x, base=n: round(100 * x / base)

    year = date.today().year
    gens = {"Gen Z": 0, "Millennials": 0, "Gen X": 0, "Boomers+": 0}
    for u in employees:
        age = year - u.birth_year
        if age < 29:
            gens["Gen Z"] += 1
        elif age < 45:
            gens["Millennials"] += 1
        elif age < 60:
            gens["Gen X"] += 1
        else:
            gens["Boomers+"] += 1

    training = []
    for dept in db.query(models.Department).filter(models.Department.active.is_(True),
                                                   models.Department.org_id == user.org_id):
        members = [u for u in employees if u.department_id == dept.id]
        if members:
            training.append([dept.name, pct(sum(1 for u in members if u.training_complete), len(members))])

    commute_labels = {"public": "Public transport", "private": "Private vehicle",
                      "carpool": "Carpool", "walk": "Walk / cycle", "ev": "EV"}
    commute = [
        [label, pct(sum(1 for u in employees if u.commute_mode == mode))]
        for mode, label in commute_labels.items()
    ]

    return {
        "representation": [
            ["Women in workforce", pct(women)],
            ["Women in leadership", pct(women_lead, len([u for u in leaders if u]) or 1)],
            ["LGBTQIA+ (voluntary self-ID)", pct(sum(1 for u in employees if u.lgbtq_self_id))],
            ["Persons with disabilities", pct(sum(1 for u in employees if u.disability_self_id))],
        ],
        "culture": {
            "stats": [
                ["Nationalities", len({u.nationality for u in employees})],
                ["Languages spoken", len({u.language for u in employees})],
                ["In leadership", len([u for u in leaders if u])],
                ["Avg age", round(sum(year - u.birth_year for u in employees) / n)],
            ],
            "gens": [[k, pct(v)] for k, v in gens.items()],
        },
        "training": training,
        "commute": commute,
    }
