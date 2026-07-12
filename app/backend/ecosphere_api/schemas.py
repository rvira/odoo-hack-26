"""Request schemas — explicit allow-listed fields, unknown fields rejected
(extra='forbid'), type + range + length validated before any handler runs."""
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(Strict):
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=200)


class CarbonTxnIn(Strict):
    source_type: str = Field(pattern=r"^(purchase|manufacturing|expense|fleet)$")
    source_desc: str = Field(min_length=1, max_length=200)
    department_id: int = Field(gt=0)
    scope: int = Field(ge=1, le=3)
    quantity: float = Field(gt=0)
    unit: str = Field(min_length=1, max_length=24)
    emission_factor_id: int = Field(gt=0)
    date: date

    @field_validator("date")
    @classmethod
    def not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Transaction date cannot be in the future")
        return v


class GoalIn(Strict):
    name: str = Field(min_length=1, max_length=160)
    department_id: int = Field(gt=0)
    target_value: float = Field(gt=0)
    deadline: date

    @field_validator("deadline")
    @classmethod
    def future(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Deadline must be in the future")
        return v


class DepartmentIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")
    head: str = Field(default="", max_length=120)
    parent_id: int | None = Field(default=None, gt=0)


class CategoryIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    type: str = Field(pattern=r"^(csr|challenge)$")


class FactorIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    scope: int = Field(ge=1, le=3)
    unit: str = Field(min_length=1, max_length=24)
    kgco2e_per_unit: float = Field(gt=0)
    source: str = Field(min_length=1, max_length=60)


class WeightsIn(Strict):
    E: int = Field(ge=0, le=100)
    S: int = Field(ge=0, le=100)
    G: int = Field(ge=0, le=100)


class TogglesIn(Strict):
    auto_emission: bool
    evidence_required: bool
    badge_auto_award: bool
    overdue_flagging: bool
    notify_compliance: bool
    notify_decisions: bool
    notify_ack_reminders: bool
    notify_badges: bool


class SettingsIn(Strict):
    weights: WeightsIn
    toggles: TogglesIn


class IssueIn(Strict):
    title: str = Field(min_length=1, max_length=200)
    audit_id: int = Field(gt=0)
    severity: str = Field(pattern=r"^(low|medium|high|critical)$")
    owner_id: int = Field(gt=0)  # mandatory ownership (§8)
    due_date: date


class ResolveIn(Strict):
    resolution: str = Field(min_length=3, max_length=2000)


class ChallengeIn(Strict):
    title: str = Field(min_length=1, max_length=160)
    category_id: int = Field(gt=0)
    xp: int = Field(gt=0, le=10000)
    difficulty: str = Field(default="medium", pattern=r"^(easy|medium|hard)$")
    evidence_required: bool = False
    deadline: date

    @field_validator("deadline")
    @classmethod
    def future(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Deadline must be in the future")
        return v


class TransitionIn(Strict):
    to: str = Field(pattern=r"^(draft|active|review|completed|archived)$")


class ProgressIn(Strict):
    progress: int = Field(ge=0, le=100)


class SuggestionIn(Strict):
    ouid: str = Field(min_length=3, max_length=12, pattern=r"^[A-Za-z0-9-]+$")
    message: str = Field(min_length=3, max_length=500)


class AlertingIn(Strict):
    enabled: bool


class BuilderIn(Strict):
    date_from: date | None = None
    date_to: date | None = None
    department_id: int | None = Field(default=None, gt=0)
    module: str | None = Field(
        default=None, pattern=r"^(environmental|social|governance|gamification)$"
    )
