from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


CATEGORIES = {"safety", "facilities", "technology", "academic", "wellbeing", "other"}
STATUSES = {"reported", "triaged", "in_progress", "resolved", "closed"}


class IncidentCreate(BaseModel):
    title: str = Field(min_length=5, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    category: str
    location: str = Field(min_length=2, max_length=160)
    reporter_name: str = Field(min_length=2, max_length=80)
    severity: int = Field(ge=1, le=5)

    @field_validator("title", "description", "location", "reporter_name")
    @classmethod
    def non_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in CATEGORIES:
            raise ValueError(f"must be one of: {', '.join(sorted(CATEGORIES))}")
        return value


class IncidentUpdate(BaseModel):
    status: str
    resolution_note: str | None = Field(default=None, max_length=1000)

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in STATUSES:
            raise ValueError(f"must be one of: {', '.join(sorted(STATUSES))}")
        return value


class StatusHistoryEntry(BaseModel):
    id: int
    from_status: str | None
    to_status: str
    note: str | None
    changed_at: datetime


class Incident(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: str
    location: str
    reporter_name: str
    severity: int
    priority_score: int
    priority_factors: list[dict]
    status: str
    resolution_note: str | None
    duplicate_of: int | None
    duplicate_score: float | None
    duplicate_evidence: list[dict]
    duplicate_candidates: list[dict]
    status_history: list[StatusHistoryEntry]
    created_at: datetime
    updated_at: datetime
