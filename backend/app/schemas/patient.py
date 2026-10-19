"""Pydantic v2 schemas for the Patient resource.

These define the shape of JSON that the API accepts (requests) and
returns (responses). They are separate from the SQLAlchemy model so
we can expose only safe fields and validate input carefully.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
import re


SEX_OPTIONS = {"male", "female", "other", "prefer_not_to_say"}


class PatientCreate(BaseModel):
    """Fields required to create a new patient workspace."""

    display_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="A label for this patient workspace (nickname encouraged, real name optional).",
    )
    date_of_birth: Optional[str] = Field(
        None,
        description="Date of birth in YYYY-MM-DD format. Optional.",
    )
    sex: Optional[str] = Field(
        None,
        description="Biological sex for reference-range context. Optional.",
    )
    notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Free-form notes about the patient workspace.",
    )

    @field_validator("display_name")
    @classmethod
    def name_no_leading_trailing_spaces(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("display_name cannot be blank or only whitespace.")
        return stripped

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("date_of_birth must be in YYYY-MM-DD format.")
        return v

    @field_validator("sex")
    @classmethod
    def validate_sex(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in SEX_OPTIONS:
            raise ValueError(f"sex must be one of: {', '.join(sorted(SEX_OPTIONS))}")
        return v


class PatientUpdate(BaseModel):
    """All fields are optional for PATCH updates."""

    display_name: Optional[str] = Field(None, min_length=1, max_length=200)
    date_of_birth: Optional[str] = None
    sex: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("display_name")
    @classmethod
    def name_no_leading_trailing_spaces(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("display_name cannot be blank or only whitespace.")
        return stripped

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("date_of_birth must be in YYYY-MM-DD format.")
        return v

    @field_validator("sex")
    @classmethod
    def validate_sex(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in SEX_OPTIONS:
            raise ValueError(f"sex must be one of: {', '.join(sorted(SEX_OPTIONS))}")
        return v


class PatientResponse(BaseModel):
    """Shape of a patient returned from the API."""

    id: str
    display_name: str
    date_of_birth: Optional[str]
    sex: Optional[str]
    notes: Optional[str]
    owner_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PatientListResponse(BaseModel):
    """Paginated list of patients."""

    items: list[PatientResponse]
    total: int
