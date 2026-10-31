"""OCR subsystem for laboratory report reading."""

from app.services.extraction.ocr.base import OCREngine, OCRResult, OCRPageResult
from app.services.extraction.ocr.engine import get_ocr_engine

__all__ = ["OCREngine", "OCRResult", "OCRPageResult", "get_ocr_engine"]
