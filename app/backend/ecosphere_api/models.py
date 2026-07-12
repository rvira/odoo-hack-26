"""SQLAlchemy models — every constraint the docs' §5b validation matrix demands
is enforced here (CHECK / UNIQUE) and re-checked in the routers with clear
messages. The server rejects it; the UI merely explains it."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Organization(Base):
    """One tenant (wireframe: every company gets a unique OUID). Org admins and
    employees are pinned to their org by query-level record rules; the Super
    Admin role reads across orgs (read-scoped, per ARCHITECTURE.md §7)."""
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    ouid: Mapped[str] = mapped_column(String(12), unique=True)  # e.g. OU-1001
    name: Mapped[str] = mapped_column(String(120), unique=True)
    admin_name: Mapped[str] = mapped_column(String(120), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PlatformSettings(Base):
    """Platform-tier config owned by the Super Admin (single row)."""
    __tablename__ = "platform_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    alerting_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("org_id", "code"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(12))
    head: Mapped[str] = mapped_column(String(120), default="")
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent = relationship("Department", remote_side=[id])
    org = relationship("Organization")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(16), default="employee")  # employee|admin|super
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), index=True)  # None = platform tier
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    can_login: Mapped[bool] = mapped_column(Boolean, default=False)
    # HR attributes powering live diversity metrics (voluntary, aggregate-only)
    gender: Mapped[str] = mapped_column(String(24), default="undisclosed")
    birth_year: Mapped[int] = mapped_column(Integer, default=1990)
    is_leadership: Mapped[bool] = mapped_column(Boolean, default=False)
    lgbtq_self_id: Mapped[bool] = mapped_column(Boolean, default=False)
    disability_self_id: Mapped[bool] = mapped_column(Boolean, default=False)
    nationality: Mapped[str] = mapped_column(String(40), default="IN")
    language: Mapped[str] = mapped_column(String(40), default="en")
    commute_mode: Mapped[str] = mapped_column(String(24), default="public")
    training_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    department = relationship("Department")
    org = relationship("Organization")


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class OrgSettings(Base):
    __tablename__ = "org_settings"
    __table_args__ = (
        CheckConstraint("weight_e + weight_s + weight_g = 100", name="weights_sum_100"),
        UniqueConstraint("org_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    weight_e: Mapped[int] = mapped_column(Integer, default=40)
    weight_s: Mapped[int] = mapped_column(Integer, default=30)
    weight_g: Mapped[int] = mapped_column(Integer, default=30)
    target_score: Mapped[int] = mapped_column(Integer, default=85)
    auto_emission: Mapped[bool] = mapped_column(Boolean, default=True)
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=True)
    badge_auto_award: Mapped[bool] = mapped_column(Boolean, default=True)
    overdue_flagging: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_compliance: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_decisions: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_ack_reminders: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_badges: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("name", "type"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(16))  # csr|challenge
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class EmissionFactor(Base):
    __tablename__ = "emission_factors"
    __table_args__ = (
        CheckConstraint("kgco2e_per_unit > 0", name="factor_positive"),
        UniqueConstraint("name", "scope", "unit"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    scope: Mapped[int] = mapped_column(Integer)  # 1|2|3
    unit: Mapped[str] = mapped_column(String(24))
    kgco2e_per_unit: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(60))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CarbonTransaction(Base):
    __tablename__ = "carbon_transactions"
    __table_args__ = (CheckConstraint("quantity > 0", name="qty_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ref: Mapped[str] = mapped_column(String(16), unique=True)
    source_type: Mapped[str] = mapped_column(String(20), index=True)  # purchase|manufacturing|expense|fleet
    source_desc: Mapped[str] = mapped_column(String(200))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    scope: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(24))
    emission_factor_id: Mapped[int] = mapped_column(ForeignKey("emission_factors.id"))
    kgco2e: Mapped[float] = mapped_column(Float)
    date: Mapped[date] = mapped_column(Date, index=True)
    department = relationship("Department")
    factor = relationship("EmissionFactor")


class EnvironmentalGoal(Base):
    __tablename__ = "environmental_goals"
    __table_args__ = (CheckConstraint("target_value > 0", name="target_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    target_value: Mapped[float] = mapped_column(Float)  # tCO2e budget for the period
    deadline: Mapped[date] = mapped_column(Date)
    created: Mapped[date] = mapped_column(Date, default=date.today)
    department = relationship("Department")


class ProductProfile(Base):
    __tablename__ = "product_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(24), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    co2_per_unit: Mapped[float] = mapped_column(Float)
    weightage: Mapped[float | None] = mapped_column(Float)  # None = default 1.0x
    recyclable_pct: Mapped[int] = mapped_column(Integer, default=0)


class CsrActivity(Base):
    __tablename__ = "csr_activities"
    __table_args__ = (CheckConstraint("points > 0", name="points_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    when_label: Mapped[str] = mapped_column(String(40), default="Ongoing")
    points: Mapped[int] = mapped_column(Integer)
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    category = relationship("Category")


class Participation(Base):
    __tablename__ = "participations"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id"),
        CheckConstraint("points_earned >= 0", name="points_non_negative"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("csr_activities.id"), index=True)
    proof_name: Mapped[str | None] = mapped_column(String(160))
    proof_stored: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending|approved|rejected
    points_earned: Mapped[int] = mapped_column(Integer, default=0)
    completed_on: Mapped[date] = mapped_column(Date, default=date.today)
    decided_on: Mapped[date | None] = mapped_column(Date)
    user = relationship("User")
    activity = relationship("CsrActivity")


class Challenge(Base):
    __tablename__ = "challenges"
    __table_args__ = (CheckConstraint("xp > 0", name="xp_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    xp: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[str] = mapped_column(String(12), default="medium")  # easy|medium|hard
    evidence_required: Mapped[bool] = mapped_column(Boolean, default=False)
    deadline: Mapped[date] = mapped_column(Date)
    state: Mapped[str] = mapped_column(String(12), default="draft", index=True)
    category = relationship("Category")


class ChallengeParticipation(Base):
    __tablename__ = "challenge_participations"
    __table_args__ = (
        UniqueConstraint("user_id", "challenge_id"),
        CheckConstraint("progress >= 0 AND progress <= 100", name="progress_range"),
        CheckConstraint("xp_awarded >= 0", name="xp_non_negative"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"), index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    proof_name: Mapped[str | None] = mapped_column(String(160))
    proof_stored: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), default="in_progress")
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0)
    decided_on: Mapped[date | None] = mapped_column(Date)
    user = relationship("User")
    challenge = relationship("Challenge")


class Policy(Base):
    __tablename__ = "policies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    version: Mapped[str] = mapped_column(String(12), default="v1")
    updated: Mapped[date] = mapped_column(Date, default=date.today)
    ack_due: Mapped[date | None] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PolicyAck(Base):
    __tablename__ = "policy_acks"
    __table_args__ = (UniqueConstraint("user_id", "policy_id", "version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("policies.id"), index=True)
    version: Mapped[str] = mapped_column(String(12))
    acknowledged_on: Mapped[date] = mapped_column(Date, default=date.today)
    user = relationship("User")
    policy = relationship("Policy")


class Audit(Base):
    __tablename__ = "audits"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(60))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    auditor: Mapped[str] = mapped_column(String(120))
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="planned")
    department = relationship("Department")


class ComplianceIssue(Base):
    __tablename__ = "compliance_issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    audit_id: Mapped[int] = mapped_column(ForeignKey("audits.id"))
    severity: Mapped[str] = mapped_column(String(12))  # low|medium|high|critical
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # mandatory (§8)
    due_date: Mapped[date] = mapped_column(Date)  # mandatory (§8)
    resolution: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="open")  # open|overdue|resolved
    overdue_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    audit = relationship("Audit")
    owner = relationship("User")


class Certification(Base):
    __tablename__ = "certifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    icon: Mapped[str] = mapped_column(String(8), default="🛡️")
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(60))
    status_kind: Mapped[str] = mapped_column(String(8), default="env")  # env|soc|game pill
    until: Mapped[str] = mapped_column(String(80))
    next: Mapped[str] = mapped_column(String(80))


class Badge(Base):
    __tablename__ = "badges"
    __table_args__ = (CheckConstraint("rule_threshold > 0", name="threshold_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    icon: Mapped[str] = mapped_column(String(8))
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(String(200))
    # structured unlock rule — no eval surface (CWE-94)
    rule_type: Mapped[str] = mapped_column(String(24))  # xp|challenges_completed|csr_joined
    rule_threshold: Mapped[int] = mapped_column(Integer)


class BadgeAward(Base):
    __tablename__ = "badge_awards"
    __table_args__ = (UniqueConstraint("user_id", "badge_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    badge_id: Mapped[int] = mapped_column(ForeignKey("badges.id"))
    awarded_on: Mapped[date] = mapped_column(Date, default=date.today)


class Reward(Base):
    __tablename__ = "rewards"
    __table_args__ = (
        CheckConstraint("cost > 0", name="cost_positive"),
        CheckConstraint("stock >= 0", name="stock_non_negative"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    icon: Mapped[str] = mapped_column(String(8))
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(40))
    cost: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer)


class Redemption(Base):
    __tablename__ = "redemptions"
    __table_args__ = (CheckConstraint("points_spent > 0", name="spent_positive"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reward_id: Mapped[int] = mapped_column(ForeignKey("rewards.id"))
    points_spent: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    icon: Mapped[str] = mapped_column(String(8), default="🔔")
    kind: Mapped[str] = mapped_column(String(8), default="env")  # env|soc|gov|game|danger
    text: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
