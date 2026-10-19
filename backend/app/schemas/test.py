"""Pydantic schemas for Test, TestAlias, and Normalization/Mapping APIs."""

from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, field_validator


class TestAliasResponse(BaseModel):
    """Schema for a test alias record."""

    id: str
    test_id: str
    alias_normalized: str
    raw_alias: str
    source: str
    patient_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CanonicalTestCreate(BaseModel):
    """Payload to create a new canonical lab test."""

    canonical_name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    preferred_unit: Optional[str] = Field(None, max_length=50)

    @field_validator("canonical_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("canonical_name cannot be empty or blank.")
        return s


class CanonicalTestResponse(BaseModel):
    """Schema for a canonical lab test."""

    id: str
    canonical_name: str
    category: Optional[str] = None
    preferred_unit: Optional[str] = None
    is_seeded: bool
    aliases_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanonicalTestDetailResponse(CanonicalTestResponse):
    """Schema for canonical test with its full list of aliases."""

    aliases: List[TestAliasResponse] = Field(default_factory=list)


class TestSuggestion(BaseModel):
    """Suggested canonical match for an unmatched test name."""

    test_id: str
    canonical_name: str
    category: Optional[str] = None
    preferred_unit: Optional[str] = None
    similarity_score: int  # 0 to 100


class UnmatchedTestItem(BaseModel):
    """Summary of an unmatched raw test name found in a patient workspace."""

    raw_test_name: str
    normalized_name: str
    occurrence_count: int
    reports: List[Dict[str, Any]]
    observed_units: List[str]
    suggestions: List[TestSuggestion]


class UnmatchedTestsResponse(BaseModel):
    """Response containing all unmatched tests for a patient."""

    patient_id: str
    total_unmatched: int
    items: List[UnmatchedTestItem]


class MappingCreate(BaseModel):
    """Payload to link a raw test name to a canonical test."""

    raw_test_name: str = Field(..., min_length=1, max_length=255)
    test_id: str = Field(..., min_length=1)
    is_global: bool = False


class MappingResponse(BaseModel):
    """Result of mapping a raw name to a canonical test."""

    alias: TestAliasResponse
    updated_results_count: int


class UnitMismatchItem(BaseModel):
    """Discrepancy alert for units of the same canonical test across reports."""

    test_id: str
    canonical_name: str
    preferred_unit: Optional[str] = None
    observed_units: List[str]
    affected_reports_count: int
    message: str


class UnitMismatchResponse(BaseModel):
    """Response containing all unit mismatches in a patient workspace."""

    patient_id: str
    mismatches_count: int
    items: List[UnitMismatchItem]
