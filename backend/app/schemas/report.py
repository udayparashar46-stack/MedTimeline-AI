"""Pydantic v2 schemas for Report resources.

Defines serialized representations for uploaded reports, lists,
batch upload summary results, and M4 extraction inspection.
"""

import json
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator


class DateCandidateSchema(BaseModel):
    """Candidate report date with source context and priority."""

    date_iso: str
    source_text: str
    label_type: str
    confidence: str


class ReportResponse(BaseModel):
    """Shape of an uploaded report returned by the API."""

    id: str
    patient_id: str
    original_filename: str
    file_path: str
    file_sha256: str
    file_size_bytes: int
    page_count: int
    status: str
    failure_reason: Optional[str] = None
    has_text_layer: bool = False
    lab_name: Optional[str] = None
    report_date: Optional[str] = None
    report_date_source_text: Optional[str] = None
    report_date_confirmed: bool = False
    is_date_ambiguous: bool = False
    date_alternatives: List[dict] = Field(default_factory=list)
    extraction_version: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("date_alternatives", mode="before")
    @classmethod
    def parse_alternatives(cls, v: Any) -> List[dict]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                return []
        if isinstance(v, list):
            return v
        return []


class ReportUpdate(BaseModel):
    """Fields that can be updated for a report (date confirmation, lab name, status)."""

    report_date: Optional[str] = None
    report_date_confirmed: Optional[bool] = None
    lab_name: Optional[str] = None
    status: Optional[str] = None  # "needs_review" | "reviewed"



class ReportExtractionResponse(BaseModel):
    """Detailed extraction results including raw text for debugging."""

    report_id: str
    patient_id: str
    original_filename: str
    has_text_layer: bool
    is_scanned: bool
    status: str
    failure_reason: Optional[str]
    report_date: Optional[str]
    report_date_source_text: Optional[str]
    report_date_confirmed: bool
    is_date_ambiguous: bool
    date_alternatives: List[dict]
    extracted_text: Optional[str]
    extraction_version: Optional[str]


class ReportListResponse(BaseModel):
    """List of reports for a patient workspace."""

    items: list[ReportResponse]
    total: int


class ReportUploadItem(BaseModel):
    """Result for an individual file in a batch upload."""

    filename: str
    status: str  # "uploaded" | "duplicate_skipped" | "failed"
    report: Optional[ReportResponse] = None
    message: Optional[str] = None


class BatchUploadResponse(BaseModel):
    """Summary response for multi-PDF upload."""

    items: list[ReportUploadItem]
    uploaded_count: int
    skipped_count: int
    failed_count: int
