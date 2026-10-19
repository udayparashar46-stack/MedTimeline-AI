"""Pydantic v2 schemas for ExtractedResult and ResultEdit resources."""

import json
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator


class ResultEditResponse(BaseModel):
    """Shape of a single audit log entry for a corrected result field."""

    id: str
    result_id: str
    field: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    edited_by: Optional[str] = "user"
    created_at: datetime

    model_config = {"from_attributes": True}


class ExtractedResultResponse(BaseModel):
    """API representation of a single extracted lab result row with effective values and audit log."""

    id: str
    report_id: str
    page_number: int
    row_order: int
    section_heading: Optional[str] = None

    # Immutable raw values extracted from PDF
    raw_test_name: str
    raw_value_text: str
    raw_unit: Optional[str] = None
    raw_reference_text: Optional[str] = None
    printed_flag: Optional[str] = None
    source_snippet: str
    bbox: Optional[List[float]] = None

    parse_confidence: str
    test_id: Optional[str] = None
    canonical_name: Optional[str] = None
    review_status: str

    # Effective values (latest edit overlay or raw value)
    effective_test_name: str
    effective_value_text: str
    effective_unit: Optional[str] = None
    effective_reference_text: Optional[str] = None
    effective_printed_flag: Optional[str] = None

    # Derived read-only numeric properties
    value_numeric: Optional[float] = None
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None
    comparator: Optional[str] = None

    # Audit history
    has_edits: bool = False
    edits: List[ResultEditResponse] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("bbox", mode="before")
    @classmethod
    def parse_bbox(cls, v: Any) -> Optional[List[float]]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [float(x) for x in parsed]
            except Exception:
                return None
        if isinstance(v, list):
            return [float(x) for x in v]
        return None


class ResultUpdate(BaseModel):
    """Fields that can be updated on an extracted result."""

    test_name: Optional[str] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    reference_text: Optional[str] = None
    printed_flag: Optional[str] = None
    review_status: Optional[str] = None  # "confirmed" | "rejected" | "unreviewed" | "edited"


class ManualResultCreate(BaseModel):
    """Payload to manually add a test result row to a report."""

    page_number: int = 1
    test_name: str = Field(..., min_length=1, max_length=255)
    value_text: str = Field(..., min_length=1, max_length=100)
    unit: Optional[str] = Field(None, max_length=50)
    reference_text: Optional[str] = Field(None, max_length=100)
    printed_flag: Optional[str] = Field(None, max_length=20)
    section_heading: Optional[str] = Field(None, max_length=200)


class BulkConfirmRequest(BaseModel):
    """Payload to bulk-confirm unreviewed rows in a report."""

    report_id: str
    confidence: Optional[str] = "high"
    result_ids: Optional[List[str]] = None


class BulkConfirmResponse(BaseModel):
    """Response returned after bulk confirming rows."""

    report_id: str
    confirmed_count: int
    results: List[ExtractedResultResponse]


class ReportResultsSummary(BaseModel):
    """Summary of extracted rows and confidence breakdown for a report."""

    total_rows: int
    needs_review_count: int
    high_confidence_count: int
    medium_confidence_count: int
    low_confidence_count: int
    skipped_lines_count: int
    layout_strategy: Optional[str] = None


class ReportResultsResponse(BaseModel):
    """Full extraction results and summary for a report."""

    report_id: str
    summary: ReportResultsSummary
    results: List[ExtractedResultResponse]
