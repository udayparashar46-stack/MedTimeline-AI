"""Extraction pipeline orchestrator (Milestone 4).

Coordinates:
1. Text layer detection (and scanned PDF flagging)
2. Report collection date detection and disambiguation
3. Extraction result packaging for persistence
"""

import json
from dataclasses import dataclass, asdict, field
from typing import List, Optional


from app.services.extraction.text_layer import detect_text_layer, TextLayerResult
from app.services.extraction.date_detect import (
    detect_report_date,
    DateDetectionResult,
)
from app.services.extraction.parsers import (
    extract_rows_from_pdf_bytes,
    RowPipelineResult,
    ParsedRowCandidate,
)

EXTRACTION_VERSION = "v0.6.0-m6"


@dataclass
class ExtractionResult:
    has_text_layer: bool
    is_scanned: bool
    total_characters: int
    page_count: int
    status: str  # "needs_review" | "failed"
    failure_reason: Optional[str]
    report_date: Optional[str]
    report_date_source_text: Optional[str]
    is_date_ambiguous: bool
    date_alternatives: List[dict]
    extracted_text: str
    extraction_version: str
    rows: List[ParsedRowCandidate] = field(default_factory=list)
    row_summary: Optional[dict] = None

    def to_dict(self) -> dict:
        return asdict(self)


def extract_report_from_bytes(pdf_bytes: bytes) -> ExtractionResult:
    """Execute M4 text/date & M5 row parsing extraction pipeline on raw PDF bytes."""
    # Step 1: Detect text layer
    text_res: TextLayerResult = detect_text_layer(pdf_bytes)

    # Step 2: Handle image-only or scanned reports
    if not text_res.has_text_layer:
        return ExtractionResult(
            has_text_layer=False,
            is_scanned=text_res.is_scanned,
            total_characters=text_res.total_characters,
            page_count=text_res.page_count,
            status="needs_review",
            failure_reason=text_res.warning_message,
            report_date=None,
            report_date_source_text=None,
            is_date_ambiguous=False,
            date_alternatives=[],
            extracted_text=text_res.full_text,
            extraction_version=EXTRACTION_VERSION,
            rows=[],
            row_summary={
                "total_rows": 0,
                "needs_review_count": 0,
                "high_count": 0,
                "medium_count": 0,
                "low_count": 0,
                "skipped_lines_count": 0,
                "strategy_used": "none",
            },
        )

    # Step 3: Detect and rank report collection dates
    date_res: DateDetectionResult = detect_report_date(text_res.full_text)

    # Step 4: Extract test rows and score confidence
    row_res: RowPipelineResult = extract_rows_from_pdf_bytes(pdf_bytes)

    failure_reason = None
    if not date_res.detected_date:
        failure_reason = "No report collection date could be detected automatically. Manual confirmation required."

    return ExtractionResult(
        has_text_layer=True,
        is_scanned=False,
        total_characters=text_res.total_characters,
        page_count=text_res.page_count,
        status="needs_review",
        failure_reason=failure_reason,
        report_date=date_res.detected_date,
        report_date_source_text=date_res.source_text,
        is_date_ambiguous=date_res.is_ambiguous,
        date_alternatives=[a.to_dict() for a in date_res.alternatives],
        extracted_text=text_res.full_text,
        extraction_version=EXTRACTION_VERSION,
        rows=row_res.rows,
        row_summary={
            "total_rows": row_res.total_rows,
            "needs_review_count": row_res.needs_review_count,
            "high_count": row_res.high_count,
            "medium_count": row_res.medium_count,
            "low_count": row_res.low_count,
            "skipped_lines_count": row_res.skipped_lines_count,
            "strategy_used": row_res.strategy_used,
        },
    )

