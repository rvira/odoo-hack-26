"""Enforcement-engine services shared by routers: notifications, badge
auto-award, overdue flagging, proof-upload validation."""
import secrets
from datetime import date, datetime

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from . import models, scoring
from .database import UPLOAD_DIR

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAGIC = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG": ".png",
    b"%PDF": ".pdf",
}


def notify(db: Session, user_id: int, text: str, icon: str = "🔔", kind: str = "env") -> None:
    db.add(models.Notification(user_id=user_id, text=text, icon=icon, kind=kind))


def notify_admins(db: Session, org_id: int, text: str, icon: str, kind: str) -> None:
    for admin in db.query(models.User).filter(models.User.role == "admin",
                                              models.User.org_id == org_id):
        notify(db, admin.id, text, icon, kind)


def check_badges(db: Session, user_id: int) -> list[str]:
    """Badge Auto-Award (§8 rule 3) — structured rules, no eval (CWE-94)."""
    user = db.get(models.User, user_id)
    settings = scoring.org_settings(db, user.org_id)
    if settings is None or not settings.badge_auto_award:
        return []
    stats = scoring.user_stats(db, user_id)
    owned = {
        ba.badge_id
        for ba in db.query(models.BadgeAward).filter(models.BadgeAward.user_id == user_id)
    }
    awarded = []
    for badge in db.query(models.Badge):
        if badge.id in owned:
            continue
        value = stats.get(badge.rule_type, 0)
        if value >= badge.rule_threshold:
            db.add(models.BadgeAward(user_id=user_id, badge_id=badge.id))
            awarded.append(badge.name)
            if settings.notify_badges:
                notify(db, user_id, f"Badge unlocked: {badge.name}", badge.icon, "game")
    return awarded


def flag_overdue_issues(db: Session) -> None:
    """Compliance auto-overdue (§8 rule 4) — idempotent, notify once, gated on
    the owning org's settings."""
    today = date.today()
    stale = (
        db.query(models.ComplianceIssue)
        .filter(
            models.ComplianceIssue.status == "open",
            models.ComplianceIssue.due_date < today,
        )
        .all()
    )
    for issue in stale:
        settings = scoring.org_settings(db, issue.owner.org_id)
        if settings is None or not settings.overdue_flagging:
            continue
        issue.status = "overdue"
        if not issue.overdue_notified:
            issue.overdue_notified = True
            if settings.notify_compliance:
                notify(db, issue.owner_id,
                       f"Compliance issue overdue: “{issue.title}”", "⚠️", "danger")
                notify_admins(db, issue.owner.org_id,
                              f"Compliance issue overdue: “{issue.title}”",
                              "⚠️", "danger")
    db.commit()


async def store_proof(file: UploadFile) -> tuple[str, str]:
    """Validate (magic bytes + size cap) and store a proof file outside any
    web root under a server-generated name. Returns (display_name, stored_name)."""
    head = await file.read(8)
    ext = next((e for magic, e in MAGIC.items() if head.startswith(magic)), None)
    if ext is None:
        raise HTTPException(422, "Proof must be a JPG, PNG or PDF file")
    rest = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(rest) + len(head) > MAX_UPLOAD_BYTES:
        raise HTTPException(422, "Proof file exceeds the 5 MB limit")
    stored = f"{secrets.token_hex(16)}{ext}"
    (UPLOAD_DIR / stored).write_bytes(head + rest)
    display = (file.filename or f"proof{ext}")[:150]
    # display-name is untrusted input: strip path separators and control chars
    display = "".join(c for c in display if c.isprintable() and c not in "/\\") or f"proof{ext}"
    return display, stored


def relative_when(dt: datetime) -> str:
    delta = datetime.utcnow() - dt
    if delta.days > 0:
        return f"{delta.days}d ago"
    hours = delta.seconds // 3600
    if hours:
        return f"{hours}h ago"
    minutes = max(1, delta.seconds // 60)
    return f"{minutes}m ago"
