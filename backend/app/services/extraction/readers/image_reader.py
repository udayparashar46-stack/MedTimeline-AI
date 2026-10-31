"""Image Document Reader for JPEG, PNG, TIFF laboratory reports."""

import logging
from typing import List
import fitz  # PyMuPDF

from app.services.extraction.readers.base import (
    AbstractDocumentReader,
    DocumentContent,
    DocumentPage,
)
from app.services.extraction.ocr import get_ocr_engine
from app.services.storage import storage_service

logger = logging.getLogger(__name__)


class ImageDocumentReader(AbstractDocumentReader):
    """Reader for image-based laboratory reports (JPEG, PNG, TIFF)."""

    def can_read(self, format_key: str) -> bool:
        return format_key in ("image_jpeg", "image_png", "image_tiff")

    def read(self, content: bytes, original_filename: str = "") -> DocumentContent:
        # Convert image to a standard PDF for visual rendering and review
        pdf_bytes = storage_service.convert_image_to_pdf(content)

        # Execute OCR engine
        ocr_engine = get_ocr_engine()
        ocr_res = ocr_engine.extract_text_from_image(content)

        if ocr_res.success and ocr_res.total_characters >= 20:
            doc_pages: List[DocumentPage] = []
            for p_res in ocr_res.pages:
                doc_pages.append(
                    DocumentPage(
                        page_number=p_res.page_number,
                        text=p_res.text,
                        visual_lines=p_res.visual_lines,
                        char_count=len(p_res.text.strip()),
                        has_text_layer=True,
                        is_scanned=True,
                    )
                )

            if not doc_pages:
                doc_pages.append(
                    DocumentPage(
                        page_number=1,
                        text=ocr_res.full_text,
                        visual_lines=[],
                        char_count=ocr_res.total_characters,
                        has_text_layer=True,
                        is_scanned=True,
                    )
                )

            return DocumentContent(
                format="image",
                page_count=len(doc_pages),
                pages=doc_pages,
                full_text=ocr_res.full_text,
                is_scanned=True,
                has_text_layer=True,
                total_characters=ocr_res.total_characters,
                renderable_pdf_bytes=pdf_bytes,
                warning_message=ocr_res.message,
            )
        else:
            page = DocumentPage(
                page_number=1,
                text="",
                visual_lines=[],
                char_count=0,
                has_text_layer=False,
                is_scanned=True,
            )
            return DocumentContent(
                format="image",
                page_count=1,
                pages=[page],
                full_text="",
                is_scanned=True,
                has_text_layer=False,
                total_characters=0,
                renderable_pdf_bytes=pdf_bytes,
                warning_message=ocr_res.message or (
                    "Image laboratory report uploaded. Optical character recognition could not detect readable clinical text; "
                    "you can view the report in the Review modal and add test values manually."
                ),
            )
