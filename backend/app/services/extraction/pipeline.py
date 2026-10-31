"""Universal Laboratory Report Extraction Pipeline.

Coordinates:
1. Multi-format document reading (PDF, Image, DOCX)
2. Text layer and scanned document detection with modular OCR fallback
3. Patient demographic and provenance metadata extraction (with patient safety mismatch guard)
4. Report collection date detection and disambiguation
5. Deterministic row parsing across visual lines and structured tables
6. Extraction result packaging for persistence
"""

import json
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict, Any

from app.services.extraction.readers import (
    get_document_reader,
    DocumentContent,
)
from app.services.extraction.metadata_detect import (
    detect_document_metadata,
    ExtractedDocumentMetadata,
)
from app.services.extraction.date_detect import (
    detect_report_date,
    DateDetectionResult,
)
from app.services.extraction.parsers.layout_models import (
    ParsedRowCandidate,
    VisualLine,
)
from app.services.extraction.parsers.table_layout import run_table_layout_strategy
from app.services.extraction.parsers.line_layout import run_line_layout_strategy
from app.services.extraction.parsers import (
    RowPipelineResult,
)

EXTRACTION_VERSION = "v1.0.0-universal"


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

    # Clinical metadata & patient safety
    lab_name: Optional[str] = None
    detected_patient_name: Optional[str] = None
    patient_id_or_mrn: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    referring_doctor: Optional[str] = None
    collection_date: Optional[str] = None
    specimen_type: Optional[str] = None
    patient_mismatch_warning: Optional[str] = None
    renderable_pdf_bytes: Optional[bytes] = None

    def to_dict(self) -> dict:
        return asdict(self)


def extract_report_from_bytes(
    file_bytes: bytes,
    filename: str = "report.pdf",
    target_patient_name: Optional[str] = None,
) -> ExtractionResult:
    """Execute Universal Extraction Pipeline across PDF, Images, or DOCX documents."""
    reader, fmt = get_document_reader(file_bytes, filename)
    doc_content: DocumentContent = reader.read(file_bytes, original_filename=filename)

    # 1. Handle unreadable or empty documents
    if not doc_content.has_text_layer:
        return ExtractionResult(
            has_text_layer=False,
            is_scanned=doc_content.is_scanned,
            total_characters=doc_content.total_characters,
            page_count=doc_content.page_count,
            status="needs_review",
            failure_reason=doc_content.warning_message,
            report_date=None,
            report_date_source_text=None,
            is_date_ambiguous=False,
            date_alternatives=[],
            extracted_text=doc_content.full_text,
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
            renderable_pdf_bytes=doc_content.renderable_pdf_bytes,
        )

    # 2. Extract clinical metadata & verify patient identity
    metadata: ExtractedDocumentMetadata = detect_document_metadata(
        doc_content.full_text, target_patient_name=target_patient_name
    )

    # 3. Detect and disambiguate report dates
    date_res: DateDetectionResult = detect_report_date(doc_content.full_text)
    detected_date = metadata.report_date or date_res.detected_date

    # 4. Extract rows using layout strategies across all visual lines
    visual_lines = doc_content.get_all_visual_lines()
    winning_rows: List[ParsedRowCandidate] = []
    strategy_used = "none"
    high_count = 0
    medium_count = 0
    low_count = 0
    skipped_count = 0

    if visual_lines:
        res_table = run_table_layout_strategy(visual_lines)
        res_line = run_line_layout_strategy(visual_lines)

        if res_table.total_rows > 0 and res_table.score >= res_line.score:
            winning = res_table
        elif res_line.total_rows > 0:
            winning = res_line
        elif res_table.total_rows > 0:
            winning = res_table
        else:
            winning = res_line

        winning_rows = winning.rows
        strategy_used = winning.strategy_name
        high_count = winning.high_count
        medium_count = winning.medium_count
        low_count = winning.low_count
        skipped_count = len(winning.skipped_lines)

    failure_reason = None
    if metadata.patient_mismatch_warning:
        failure_reason = metadata.patient_mismatch_warning
    elif not detected_date:
        failure_reason = "No report collection date could be detected automatically. Manual confirmation required."

    return ExtractionResult(
        has_text_layer=True,
        is_scanned=doc_content.is_scanned,
        total_characters=doc_content.total_characters,
        page_count=doc_content.page_count,
        status="needs_review",
        failure_reason=failure_reason,
        report_date=detected_date,
        report_date_source_text=date_res.source_text,
        is_date_ambiguous=date_res.is_ambiguous,
        date_alternatives=[a.to_dict() for a in date_res.alternatives],
        extracted_text=doc_content.full_text,
        extraction_version=EXTRACTION_VERSION,
        rows=winning_rows,
        row_summary={
            "total_rows": len(winning_rows),
            "needs_review_count": len(winning_rows),
            "high_count": high_count,
            "medium_count": medium_count,
            "low_count": low_count,
            "skipped_lines_count": skipped_count,
            "strategy_used": strategy_used,
        },
        lab_name=metadata.lab_name,
        detected_patient_name=metadata.patient_name,
        patient_id_or_mrn=metadata.patient_id_or_mrn,
        age=metadata.age,
        sex=metadata.sex,
        referring_doctor=metadata.referring_doctor,
        collection_date=metadata.collection_date,
        specimen_type=metadata.specimen_type,
        patient_mismatch_warning=metadata.patient_mismatch_warning,
        renderable_pdf_bytes=doc_content.renderable_pdf_bytes,
    )
