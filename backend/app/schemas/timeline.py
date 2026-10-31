"""Pydantic v2 schemas for the Timeline resource (Milestones 8 & 9).

Matrix structure:
- columns: Chronological report columns (sorted ascending by report_date then report creation)
- rows: Tests as rows, grouped by category (or 'Ungrouped')
- cells: Result values, review flags, evidence references for drawer
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class TimelineReportColumn(BaseModel):
    """Represents a column in the timeline matrix corresponding to a lab report."""
    report_id: str
    report_date: Optional[str] = Field(None, description="Report date in YYYY-MM-DD format")
    formatted_date: str = Field(..., description="Display label e.g. '15 Oct 2026' or 'Unspecified Date'")
    lab_name: Optional[str] = None
    original_filename: str
    report_status: str
    report_date_confirmed: bool


class TimelineCell(BaseModel):
    """Cell at the intersection of a test row and report column."""
    result_id: str
    report_id: str
    raw_test_name: str
    effective_value_text: str
    effective_unit: Optional[str] = None
    effective_reference_text: Optional[str] = None
    printed_flag: Optional[str] = None  # 'H', 'L', etc.
    review_status: str  # 'unreviewed', 'confirmed', 'edited', 'manual', 'rejected'
    parse_confidence: str
    page_number: int
    source_snippet: str
    is_edited: bool = False
    derived_value_numeric: Optional[float] = None
    derived_comparator: Optional[str] = None


class TimelineRow(BaseModel):
    """Row in the timeline matrix representing one canonical (or unmapped) test."""
    test_id: Optional[str] = Field(None, description="Canonical test ID if mapped, else None")
    test_name: str = Field(..., description="Display test name (canonical if mapped, else raw)")
    category: str = Field("Ungrouped", description="Category heading e.g. 'Complete Blood Count'")
    preferred_unit: Optional[str] = None
    standard_reference_range: Optional[str] = Field(None, description="Laboratory reference range or 'Lab-specific'")
    is_canonical: bool = True
    # Keyed by report_id -> TimelineCell
    cells: Dict[str, TimelineCell] = Field(default_factory=dict)
    # Track observed units across reports for warning flags
    has_unit_mismatch: bool = False
    observed_units: List[str] = Field(default_factory=list)


class TimelineResponse(BaseModel):
    """Complete timeline matrix response."""
    patient_id: str
    patient_name: str
    columns: List[TimelineReportColumn] = Field(default_factory=list)
    rows: List[TimelineRow] = Field(default_factory=list)
    total_tests: int = 0
    total_columns: int = 0
    categories: List[str] = Field(default_factory=list)
    has_unreviewed_results: bool = False
    include_unreviewed: bool = False
