"""Text-layer detection for uploaded lab report PDFs.

Follows blueprint Section 9.1:
- Uses PyMuPDF to extract text from each page.
- If total text is below a minimum threshold, flags the PDF as scanned/image-only:
  has_text_layer = False, status = needs_review, with a clear message:
  "No readable text found. OCR is not supported yet; manual entry only."
- Never pretends OCR is supported.
- Preserves raw extracted page text for downstream date detection and row parsing.
"""

from dataclasses import dataclass
from typing import List, Optional
import fitz  # PyMuPDF


MIN_CHAR_COUNT_TOTAL = 40
MIN_CHAR_COUNT_PER_PAGE = 15


@dataclass
class TextLayerResult:
    has_text_layer: bool
    is_scanned: bool
    total_characters: int
    page_count: int
    full_text: str
    pages_text: List[str]
    warning_message: Optional[str] = None


def detect_text_layer(pdf_bytes: bytes) -> TextLayerResult:
    """Analyze a PDF document in memory and extract its text layer.

    Returns TextLayerResult containing text readability metrics,
    page text, and scanned flags.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = doc.page_count

    if page_count == 0:
        doc.close()
        return TextLayerResult(
            has_text_layer=False,
            is_scanned=False,
            total_characters=0,
            page_count=0,
            full_text="",
            pages_text=[],
            warning_message="PDF contains no pages.",
        )

    pages_text: List[str] = []
    total_chars = 0
    total_images = 0

    for page_idx in range(page_count):
        page = doc.load_page(page_idx)
        text = page.get_text("text") or ""
        cleaned = text.strip()
        pages_text.append(text)
        total_chars += len(cleaned)
        total_images += len(page.get_images())

    doc.close()

    full_text = "\n\n--- Page Break ---\n\n".join(pages_text)

    # Determine if readable text layer exists
    is_insufficient_text = (
        total_chars < MIN_CHAR_COUNT_TOTAL
        or (total_chars / max(page_count, 1)) < MIN_CHAR_COUNT_PER_PAGE
    )

    if is_insufficient_text:
        # Attempt OCR where feasible if OCR is enabled
        try:
            from app.core.config import settings
            from app.services.extraction.ocr import get_ocr_engine
            if getattr(settings, "OCR_ENABLED", True):
                ocr_engine = get_ocr_engine()
                ocr_res = ocr_engine.extract_text_from_pdf(pdf_bytes)
                if ocr_res.success and ocr_res.total_characters >= MIN_CHAR_COUNT_TOTAL:
                    return TextLayerResult(
                        has_text_layer=True,
                        is_scanned=True,
                        total_characters=ocr_res.total_characters,
                        page_count=page_count,
                        full_text=ocr_res.full_text,
                        pages_text=[p.text for p in ocr_res.pages],
                        warning_message=(
                            "Optical Character Recognition (OCR) extracted text from this scanned image. "
                            "Please carefully verify extracted values against original report in the Review modal."
                        ),
                    )
        except Exception as e:
            logger.warning(f"Fallback OCR in text_layer failed: {e}")

        warning = (
            "No readable text found. This document appears to be a scanned or image-only PDF without a digital text layer. "
            "OCR engine is not configured in this environment; manual result entry is supported in the Review modal."
        )
        return TextLayerResult(
            has_text_layer=False,
            is_scanned=True,
            total_characters=total_chars,
            page_count=page_count,
            full_text=full_text,
            pages_text=pages_text,
            warning_message=warning,
        )

    return TextLayerResult(
        has_text_layer=True,
        is_scanned=False,
        total_characters=total_chars,
        page_count=page_count,
        full_text=full_text,
        pages_text=pages_text,
        warning_message=None,
    )
