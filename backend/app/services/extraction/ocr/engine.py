"""Concrete OCR engines and engine factory.

Provides local, privacy-preserving Optical Character Recognition (OCR)
powered by PyMuPDF's integrated Tesseract C++ engine.

Works uniformly on Windows local development and Render production environments
without requiring external system binaries or paid cloud APIs.
"""

import logging
import os
import urllib.request
from typing import List, Optional
import fitz  # PyMuPDF

from app.services.extraction.ocr.base import OCREngine, OCRResult, OCRPageResult
from app.services.extraction.parsers.layout_models import VisualLine, WordBox
from app.core.config import settings

logger = logging.getLogger(__name__)

OFFICIAL_TESSDATA_URL = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata"


def get_tessdata_dir() -> Optional[str]:
    """Resolve and return path to tessdata directory containing eng.traineddata."""
    # 1. Environment variable TESSDATA_PREFIX
    env_dir = os.environ.get("TESSDATA_PREFIX")
    if env_dir and os.path.exists(os.path.join(env_dir, "eng.traineddata")):
        return env_dir

    # 2. Settings configuration
    cfg_dir = getattr(settings, "TESSDATA_DIR", None)
    if cfg_dir and os.path.exists(os.path.join(cfg_dir, "eng.traineddata")):
        return cfg_dir

    # 3. Local bundled package directory
    local_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "tessdata"))
    target_file = os.path.join(local_dir, "eng.traineddata")
    if os.path.exists(target_file) and os.path.getsize(target_file) > 100_000:
        return local_dir

    # 4. Attempt automatic download if not present
    try:
        os.makedirs(local_dir, exist_ok=True)
        logger.info(f"Downloading Tesseract language data (eng.traineddata) to {local_dir}...")
        urllib.request.urlretrieve(OFFICIAL_TESSDATA_URL, target_file)
        if os.path.exists(target_file) and os.path.getsize(target_file) > 100_000:
            logger.info("eng.traineddata successfully downloaded and initialized.")
            return local_dir
    except Exception as e:
        logger.warning(f"Unable to auto-download eng.traineddata: {e}")

    return None


def words_to_visual_lines(raw_words: list, page_number: int) -> List[VisualLine]:
    """Convert raw PyMuPDF word tuples to structured VisualLine objects with spatial coordinates.

    Tuple structure: (x0, y0, x1, y1, word_text, block_no, line_no, word_no)
    """
    if not raw_words:
        return []

    word_boxes = [
        WordBox(
            text=str(w[4]).strip(),
            x0=float(w[0]),
            y0=float(w[1]),
            x1=float(w[2]),
            y1=float(w[3]),
            block_no=int(w[5]),
            line_no=int(w[6]),
            word_no=int(w[7]),
        )
        for w in raw_words
        if str(w[4]).strip()
    ]

    if not word_boxes:
        return []

    # Sort words primarily by vertical position (y0), secondarily by horizontal (x0)
    word_boxes.sort(key=lambda w: (w.y0, w.x0))

    lines_acc: List[List[WordBox]] = []
    for word in word_boxes:
        matched = False
        for line in lines_acc:
            # Words on same visual horizontal band (within 6.0 pt vertical delta)
            if abs(word.y0 - line[0].y0) <= 6.0:
                line.append(word)
                matched = True
                break
        if not matched:
            lines_acc.append([word])

    visual_lines: List[VisualLine] = []
    for line_words in lines_acc:
        line_words.sort(key=lambda w: w.x0)
        line_text = " ".join(w.text for w in line_words)
        visual_lines.append(
            VisualLine(
                words=line_words,
                text=line_text,
                page_number=page_number,
                y0=min(w.y0 for w in line_words),
                y1=max(w.y1 for w in line_words),
                x0=min(w.x0 for w in line_words),
                x1=max(w.x1 for w in line_words),
            )
        )

    # Sort final visual lines top-to-bottom
    visual_lines.sort(key=lambda vl: vl.y0)
    return visual_lines


class PyMuPDFOCREngine(OCREngine):
    """Production OCR engine powered by PyMuPDF's integrated Tesseract engine."""

    def __init__(self):
        self._available: Optional[bool] = None
        self._tessdata_dir: Optional[str] = None

    def get_tessdata_path(self) -> Optional[str]:
        if self._tessdata_dir is None:
            self._tessdata_dir = get_tessdata_dir()
        return self._tessdata_dir

    def is_available(self) -> bool:
        if not getattr(settings, "OCR_ENABLED", True):
            return False
        if self._available is not None:
            return self._available

        tess_dir = self.get_tessdata_path()
        if not tess_dir:
            self._available = False
            return False

        try:
            doc = fitz.open()
            page = doc.new_page(width=100, height=100)
            page.insert_text(fitz.Point(10, 20), "OCR TEST", fontsize=10)
            tp = page.get_textpage_ocr(language="eng", dpi=72, tessdata=tess_dir)
            text = tp.extractText()
            doc.close()
            self._available = True
        except Exception as e:
            logger.warning(f"PyMuPDF OCR availability check failed: {e}")
            self._available = False

        return self._available

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> OCRResult:
        if not self.is_available():
            return FallbackGuidanceOCREngine().extract_text_from_pdf(pdf_bytes)

        tess_dir = self.get_tessdata_path()
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages_res: List[OCRPageResult] = []
            full_texts: List[str] = []
            total_chars = 0

            for idx in range(len(doc)):
                page = doc[idx]
                page_num = idx + 1
                try:
                    # Execute OCR with 150 DPI for high recognition accuracy without memory bloat
                    tp = page.get_textpage_ocr(language="eng", dpi=150, full=True, tessdata=tess_dir)
                    text = tp.extractText() or ""
                    cleaned = text.strip()
                    total_chars += len(cleaned)
                    full_texts.append(text)

                    # Extract word-level coordinates for clinical layout parsing
                    raw_words = tp.extractWORDS() or []
                    v_lines = words_to_visual_lines(raw_words, page_number=page_num)

                    pages_res.append(
                        OCRPageResult(
                            page_number=page_num,
                            text=text,
                            visual_lines=v_lines,
                            confidence=0.90 if cleaned else 0.0,
                        )
                    )
                except Exception as pe:
                    logger.warning(f"OCR failed for page {page_num}: {pe}")
                    pages_res.append(OCRPageResult(page_number=page_num, text="", confidence=0.0))

            doc.close()
            has_success = total_chars >= 20
            return OCRResult(
                success=has_success,
                engine_name="pymupdf_ocr",
                pages=pages_res,
                full_text="\n\n--- Page Break ---\n\n".join(full_texts),
                total_characters=total_chars,
                message=(
                    "Optical Character Recognition (OCR) processed this scanned document. "
                    "Review and verify extracted values against the original report in the Review modal."
                    if has_success
                    else "No readable digital text found. This document appears to be a scanned or image-only PDF. OCR could not detect readable characters in this file."
                ),
            )
        except Exception as e:
            logger.error(f"PyMuPDF OCR exception: {e}")
            return FallbackGuidanceOCREngine().extract_text_from_pdf(pdf_bytes)

    def extract_text_from_image(self, image_bytes: bytes) -> OCRResult:
        """Process image file (JPEG, PNG, TIFF) through local OCR engine."""
        if not self.is_available():
            return FallbackGuidanceOCREngine().extract_text_from_image(image_bytes)

        tess_dir = self.get_tessdata_path()
        try:
            # Handle multi-page TIFF vs single images
            doc = fitz.open()
            try:
                img_doc = fitz.open(stream=image_bytes)
                for p in img_doc:
                    pix = p.get_pixmap()
                    page_w = max(pix.width, 300)
                    page_h = max(pix.height, 400)
                    new_page = doc.new_page(width=page_w, height=page_h)
                    new_page.insert_image(new_page.rect, pixmap=pix)
                img_doc.close()
            except Exception:
                # Direct pixmap fallback for single image
                pix = fitz.Pixmap(image_bytes)
                page_w = max(pix.width, 300)
                page_h = max(pix.height, 400)
                page = doc.new_page(width=page_w, height=page_h)
                page.insert_image(page.rect, pixmap=pix)

            pdf_bytes = doc.tobytes()
            doc.close()
            return self.extract_text_from_pdf(pdf_bytes)
        except Exception as e:
            logger.error(f"Image OCR failure: {e}")
            return FallbackGuidanceOCREngine().extract_text_from_image(image_bytes)


class FallbackGuidanceOCREngine(OCREngine):
    """Transparent fallback when no OCR language data is available.

    Never makes false claims about OCR. Transparently informs the doctor that
    the document was detected as scanned/image-based and provides split-screen
    manual review support.
    """

    def is_available(self) -> bool:
        return True

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> OCRResult:
        return OCRResult(
            success=False,
            engine_name="fallback_guidance",
            pages=[],
            full_text="",
            total_characters=0,
            message=(
                "No readable digital text found. This document appears to be a scanned or image-only PDF. "
                "Manual result entry is supported in the Review modal."
            ),
        )

    def extract_text_from_image(self, image_bytes: bytes) -> OCRResult:
        return OCRResult(
            success=False,
            engine_name="fallback_guidance",
            pages=[],
            full_text="",
            total_characters=0,
            message=(
                "Uploaded image received. Optical character recognition is not available; "
                "you can view the report in the Review modal and record test values manually."
            ),
        )


_active_engine = None


def get_ocr_engine() -> OCREngine:
    """Return the active OCR engine."""
    global _active_engine
    if _active_engine is None:
        pymupdf_engine = PyMuPDFOCREngine()
        if pymupdf_engine.is_available():
            _active_engine = pymupdf_engine
        else:
            _active_engine = FallbackGuidanceOCREngine()
    return _active_engine
