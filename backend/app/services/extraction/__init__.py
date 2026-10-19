"""Extraction services package."""

from app.services.extraction.pipeline import (
    extract_report_from_bytes,
    ExtractionResult,
    EXTRACTION_VERSION,
)
from app.services.extraction.text_layer import detect_text_layer, TextLayerResult
from app.services.extraction.date_detect import (
    detect_report_date,
    DateDetectionResult,
    DateCandidate,
)

__all__ = [
    "extract_report_from_bytes",
    "ExtractionResult",
    "EXTRACTION_VERSION",
    "detect_text_layer",
    "TextLayerResult",
    "detect_report_date",
    "DateDetectionResult",
    "DateCandidate",
]
