"""PDF Document Reader with digital text extraction and OCR fallback."""

import logging
from typing import List
import fitz  # PyMuPDF

from app.services.extraction.readers.base import (
    AbstractDocumentReader,
    DocumentContent,
    DocumentPage,
    ExtractedTable,
)
from app.services.extraction.parsers.row_pipeline import reconstruct_visual_lines_from_doc
from app.services.extraction.ocr import get_ocr_engine

logger = logging.getLogger(__name__)

MIN_CHAR_COUNT_TOTAL = 40
MIN_CHAR_COUNT_PER_PAGE = 15


class PDFDocumentReader(AbstractDocumentReader):
    """Universal PDF reader supporting digital, scanned, and mixed PDFs."""

    def can_read(self, format_key: str) -> bool:
        return format_key == "pdf"

    def read(self, content: bytes, original_filename: str = "") -> DocumentContent:
        try:
            doc = fitz.open(stream=content, filetype="pdf")
        except Exception as e:
            return DocumentContent(
                format="pdf",
                page_count=0,
                has_text_layer=False,
                is_scanned=False,
                warning_message=f"Failed to open PDF document: {e}",
            )

        page_count = len(doc)
        if page_count == 0:
            doc.close()
            return DocumentContent(
                format="pdf",
                page_count=0,
                has_text_layer=False,
                is_scanned=False,
                warning_message="PDF contains no pages.",
            )

        pages: List[DocumentPage] = []
        total_chars = 0
        all_texts: List[str] = []

        # Step 1: Extract native digital text
        for idx in range(page_count):
            p = doc[idx]
            page_num = idx + 1
            txt = p.get_text("text") or ""
            cleaned = txt.strip()
            total_chars += len(cleaned)
            all_texts.append(txt)

            # Check for native vector tables if supported by PyMuPDF
            detected_tables: List[ExtractedTable] = []
            try:
                tabs = p.find_tables()
                if tabs and tabs.tables:
                    for t in tabs.tables:
                        tab_data = t.extract()
                        if tab_data and len(tab_data) > 1:
                            detected_tables.append(
                                ExtractedTable(
                                    page_number=page_num,
                                    headers=[str(c or "").strip() for c in tab_data[0]],
                                    rows=[[str(c or "").strip() for c in row] for row in tab_data[1:]],
                                )
                            )
            except Exception:
                pass

            pages.append(
                DocumentPage(
                    page_number=page_num,
                    text=txt,
                    char_count=len(cleaned),
                    has_text_layer=len(cleaned) >= MIN_CHAR_COUNT_PER_PAGE,
                    is_scanned=False,
                    tables=detected_tables,
                )
            )

        # Reconstruct coordinate visual lines from native text elements
        visual_lines = reconstruct_visual_lines_from_doc(doc)
        for p in pages:
            p.visual_lines = [vl for vl in visual_lines if vl.page_number == p.page_number]

        doc.close()

        # Step 2: Detect if document is completely or partially scanned
        sparse_pages = [p for p in pages if p.char_count < MIN_CHAR_COUNT_PER_PAGE]
        is_entirely_sparse = len(sparse_pages) == page_count
        is_partially_sparse = (len(sparse_pages) > 0 and len(sparse_pages) < page_count)

        if is_entirely_sparse or is_partially_sparse:
            ocr_engine = get_ocr_engine()
            ocr_res = ocr_engine.extract_text_from_pdf(content)

            if ocr_res.success and ocr_res.total_characters >= MIN_CHAR_COUNT_TOTAL:
                # Merge OCR results for sparse pages
                for idx, ocr_p in enumerate(ocr_res.pages):
                    if idx < len(pages):
                        target_page = pages[idx]
                        if target_page.char_count < MIN_CHAR_COUNT_PER_PAGE:
                            target_page.text = ocr_p.text
                            target_page.visual_lines = ocr_p.visual_lines
                            target_page.char_count = len(ocr_p.text.strip())
                            target_page.is_scanned = True
                            target_page.has_text_layer = True
                            all_texts[idx] = ocr_p.text

                merged_text = "\n\n--- Page Break ---\n\n".join(all_texts)
                merged_total_chars = sum(p.char_count for p in pages)

                return DocumentContent(
                    format="pdf",
                    page_count=page_count,
                    pages=pages,
                    full_text=merged_text,
                    is_scanned=True,
                    has_text_layer=True,
                    total_characters=merged_total_chars,
                    renderable_pdf_bytes=content,
                    warning_message=ocr_res.message,
                )
            elif is_entirely_sparse:
                # Complete scanned document where OCR produced no readable characters
                return DocumentContent(
                    format="pdf",
                    page_count=page_count,
                    pages=pages,
                    full_text="\n\n--- Page Break ---\n\n".join(all_texts),
                    is_scanned=True,
                    has_text_layer=False,
                    total_characters=total_chars,
                    renderable_pdf_bytes=content,
                    warning_message=ocr_res.message or (
                        "No readable text found. This document appears to be a scanned or image-only PDF. "
                        "Manual result entry is supported in the Review modal."
                    ),
                )

        full_text = "\n\n--- Page Break ---\n\n".join(all_texts)
        return DocumentContent(
            format="pdf",
            page_count=page_count,
            pages=pages,
            full_text=full_text,
            is_scanned=False,
            has_text_layer=True,
            total_characters=total_chars,
            renderable_pdf_bytes=content,
            warning_message=None,
        )
