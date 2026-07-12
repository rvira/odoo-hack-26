from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models, schemas, scoring, security, services
from ..database import get_db
from .social import serve_proof

router = APIRouter(tags=["gamification"])

STATE_LABEL = {"draft": "Draft", "active": "Active", "review": "Under Review",
               "completed": "Completed", "archived": "Archived"}
# legal lifecycle: Draft → Active → Under Review → Completed; Archived from anywhere
LEGAL_TRANSITIONS = {
    "draft": {"active", "archived"},
    "active": {"review", "archived"},
    "review": {"completed", "archived"},
    "completed": {"archived"},
    "archived": set(),
}


@router.get("/challenges")
def list_challenges(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    joined = {
        cp.challenge_id
        for cp in db.query(models.ChallengeParticipation)
        .filter(models.ChallengeParticipation.user_id == user.id)
    }
    columns = {label: [] for label in STATE_LABEL.values()}
    for c in db.query(models.Challenge).order_by(models.Challenge.deadline):
        columns[STATE_LABEL[c.state]].append({
            "id": c.id, "title": c.title, "category": c.category.name,
            "category_id": c.category_id,
            "xp": c.xp, "difficulty": c.difficulty.capitalize(),
            "deadline": str(c.deadline), "evidence_required": c.evidence_required,
            "joined_by_me": c.id in joined,
        })
    return {"columns": columns}


@router.post("/challenges", status_code=201)
def create_challenge(
    body: schemas.ChallengeIn,
    request: Request,
    _: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    cat = db.get(models.Category, body.category_id)
    if cat is None or not cat.active or cat.type != "challenge":
        raise HTTPException(422, "category_id must reference an active challenge category")
    c = models.Challenge(
        title=body.title, category_id=body.category_id, xp=body.xp,
        difficulty=body.difficulty, evidence_required=body.evidence_required,
        deadline=body.deadline,
    )
    db.add(c)
    db.commit()
    return {"id": c.id, "state": STATE_LABEL[c.state]}


@router.put("/challenges/{challenge_id}")
def update_challenge(
    challenge_id: int,
    body: schemas.ChallengeIn,
    request: Request,
    _: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    c = db.get(models.Challenge, challenge_id)
    if c is None:
        raise HTTPException(404, "Challenge not found")
    if c.state != "draft":
        raise HTTPException(409, "Only Draft challenges can be edited")
    cat = db.get(models.Category, body.category_id)
    if cat is None or not cat.active or cat.type != "challenge":
        raise HTTPException(422, "category_id must reference an active challenge category")
    c.title, c.category_id, c.xp = body.title, body.category_id, body.xp
    c.difficulty, c.evidence_required, c.deadline = body.difficulty, body.evidence_required, body.deadline
    db.commit()
    return {"id": c.id}


@router.post("/challenges/{challenge_id}/transition")
def transition_challenge(
    challenge_id: int,
    body: schemas.TransitionIn,
    request: Request,
    _: models.User = Depends(security.require_admin),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    c = db.get(models.Challenge, challenge_id)
    if c is None:
        raise HTTPException(404, "Challenge not found")
    if body.to not in LEGAL_TRANSITIONS[c.state]:
        raise HTTPException(
            409,
            f"Illegal transition {STATE_LABEL[c.state]} → {STATE_LABEL[body.to]} "
            "(lifecycle: Draft → Active → Under Review → Completed; Archive from anywhere)",
        )
    c.state = body.to
    db.commit()
    return {"state": STATE_LABEL[c.state]}


@router.post("/challenges/{challenge_id}/join", status_code=201)
def join_challenge(
    challenge_id: int,
    request: Request,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    c = db.get(models.Challenge, challenge_id)
    if c is None:
        raise HTTPException(404, "Challenge not found")
    if c.state != "active":
        raise HTTPException(409, "Only Active challenges can be joined")
    dup = (
        db.query(models.ChallengeParticipation)
        .filter_by(user_id=user.id, challenge_id=challenge_id)
        .first()
    )
    if dup:
        raise HTTPException(409, "You already joined this challenge")
    cp = models.ChallengeParticipation(user_id=user.id, challenge_id=challenge_id)
    db.add(cp)
    db.commit()
    return {"id": cp.id, "status": cp.status}


@router.get("/challenge-participations")
def list_challenge_participations(
    user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)
):
    q = db.query(models.ChallengeParticipation).order_by(models.ChallengeParticipation.id.desc())
    if user.role == "admin":
        q = q.join(models.User, models.User.id == models.ChallengeParticipation.user_id).filter(
            models.User.org_id == user.org_id)
    else:
        q = q.filter(models.ChallengeParticipation.user_id == user.id)
    rows = []
    for cp in q.limit(100):
        row = {
            "id": cp.id, "challenge": cp.challenge.title, "progress": cp.progress,
            "proof": cp.proof_name, "proof_method": cp.proof_method,
            "status": cp.status.replace("_", " "),
        }
        if user.role == "admin":
            row["employee"] = cp.user.name
            row["xp"] = cp.challenge.xp
        else:
            row["xp_awarded"] = cp.xp_awarded
        rows.append(row)
    return rows


def _own_cp(db: Session, cpid: int, user: models.User) -> models.ChallengeParticipation:
    cp = db.get(models.ChallengeParticipation, cpid)
    if cp is None:
        raise HTTPException(404, "Participation not found")
    if user.role != "admin" and cp.user_id != user.id:
        raise HTTPException(403, "Not your participation")
    return cp


@router.post("/challenge-participations/{cpid}/progress")
def update_progress(
    cpid: int,
    body: schemas.ProgressIn,
    request: Request,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    cp = _own_cp(db, cpid, user)
    if cp.status not in ("in_progress", "under_review"):
        raise HTTPException(409, "Participation was already decided")
    if body.progress < cp.progress:
        raise HTTPException(422, "Progress cannot go backwards")
    cp.progress = body.progress
    cp.status = "under_review" if cp.progress >= 100 else "in_progress"
    db.commit()
    return {"progress": cp.progress, "status": cp.status.replace("_", " ")}


@router.post("/challenge-participations/{cpid}/proof")
async def upload_challenge_proof(
    cpid: int,
    request: Request,
    file: UploadFile = File(...),
    method: str = Form("upload"),
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    if method not in ("upload", "capture"):
        raise HTTPException(422, "method must be 'upload' or 'capture'")
    cp = _own_cp(db, cpid, user)
    if cp.status not in ("in_progress", "under_review"):
        raise HTTPException(409, "Participation was already decided")
    cp.proof_name, cp.proof_stored = await services.store_proof(file)
    cp.proof_method = method
    db.commit()
    return {"proof": cp.proof_name}


def _decide_cp(db: Session, cp: models.ChallengeParticipation, approve: bool) -> None:
    settings = scoring.org_settings(db, cp.user.org_id)
    if cp.status not in ("in_progress", "under_review"):
        raise HTTPException(409, "Participation was already decided")
    if approve:
        needed = settings.evidence_required or cp.challenge.evidence_required
        if needed and not cp.proof_stored:
            raise HTTPException(
                409, "Evidence Requirement is ON — a proof file must be attached before approving"
            )
        cp.status = "approved"
        cp.xp_awarded = cp.challenge.xp
    else:
        cp.status = "rejected"
        cp.xp_awarded = 0
    cp.decided_on = date.today()
    if settings.notify_decisions:
        verdict = f"approved · +{cp.xp_awarded} XP" if approve else "rejected"
        services.notify(db, cp.user_id,
                        f"Your “{cp.challenge.title}” submission was {verdict}",
                        "🏅" if approve else "❌", "game")
    if approve:
        services.check_badges(db, cp.user_id)
    db.commit()


@router.get("/challenge-participations/{cpid}/proof-file")
def challenge_proof(
    cpid: int,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    cp = _own_cp(db, cpid, user)
    if user.role == "admin" and cp.user.org_id != user.org_id:
        raise HTTPException(403, "Not your organization")
    return serve_proof(cp.proof_stored)


def _admin_cp(db: Session, cpid: int, admin: models.User) -> models.ChallengeParticipation:
    cp = db.get(models.ChallengeParticipation, cpid)
    if cp is None or cp.user.org_id != admin.org_id:
        raise HTTPException(404, "Participation not found")
    return cp


@router.post("/challenge-participations/{cpid}/approve")
def approve_cp(
    cpid: int, request: Request,
    admin: models.User = Depends(security.require_admin), db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    cp = _admin_cp(db, cpid, admin)
    _decide_cp(db, cp, approve=True)
    return {"status": cp.status, "xp_awarded": cp.xp_awarded}


@router.post("/challenge-participations/{cpid}/reject")
def reject_cp(
    cpid: int, request: Request,
    admin: models.User = Depends(security.require_admin), db: Session = Depends(get_db),
):
    security.write_limiter.check(security.client_ip(request))
    cp = _admin_cp(db, cpid, admin)
    _decide_cp(db, cp, approve=False)
    return {"status": cp.status}


@router.get("/badges")
def list_badges(user: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    earned = {
        ba.badge_id
        for ba in db.query(models.BadgeAward).filter(models.BadgeAward.user_id == user.id)
    }
    stats = scoring.user_stats(db, user.id)
    rule_label = {
        "xp": "Earn {n} XP",
        "challenges_completed": "Complete {n} challenges",
        "csr_joined": "Join {n} CSR activities",
    }
    return [
        {
            "id": b.id, "icon": b.icon, "name": b.name, "description": b.description,
            "rule_label": rule_label[b.rule_type].format(n=f"{b.rule_threshold:,}"),
            "earned": b.id in earned,
            "current": min(stats.get(b.rule_type, 0), b.rule_threshold),
            "threshold": b.rule_threshold,
        }
        for b in db.query(models.Badge).order_by(models.Badge.rule_threshold)
    ]


@router.get("/leaderboard")
def get_leaderboard(user: models.User = Depends(security.require_org_user), db: Session = Depends(get_db)):
    return scoring.leaderboard(db, user.org_id)


@router.get("/rewards")
def list_rewards(_: models.User = Depends(security.current_user), db: Session = Depends(get_db)):
    return [
        {"id": r.id, "icon": r.icon, "name": r.name, "category": r.category,
         "cost": r.cost, "stock": r.stock}
        for r in db.query(models.Reward).order_by(models.Reward.category, models.Reward.cost)
    ]


@router.post("/rewards/{reward_id}/redeem")
def redeem(
    reward_id: int,
    request: Request,
    user: models.User = Depends(security.current_user),
    db: Session = Depends(get_db),
):
    """Atomic redemption (§8 rule 5): guarded stock decrement + derived balance
    check + redemption insert in ONE transaction — no negative stock or balance
    under concurrent redeems (the CHECK(stock >= 0) constraint backstops it)."""
    security.write_limiter.check(security.client_ip(request))
    reward = db.get(models.Reward, reward_id)
    if reward is None:
        raise HTTPException(404, "Reward not found")
    try:
        updated = db.execute(
            text("UPDATE rewards SET stock = stock - 1 WHERE id = :id AND stock > 0"),
            {"id": reward_id},
        )
        if updated.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Out of stock")
        balance = scoring.user_balance(db, user.id)
        if balance < reward.cost:
            db.rollback()
            raise HTTPException(409, f"Not enough points — you have {balance}, this costs {reward.cost}")
        db.add(models.Redemption(user_id=user.id, reward_id=reward_id,
                                 points_spent=reward.cost))
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Redemption failed — nothing was deducted")
    return {"balance": scoring.user_balance(db, user.id)}
