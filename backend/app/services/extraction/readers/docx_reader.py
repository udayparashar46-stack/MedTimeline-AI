"""DOCX Document Reader for Microsoft Word laboratory reports."""

import io
import logging
import zipfile
import xml.etree.ElementTree as ET
from typing import List

from app.services.extraction.readers.base import (
    AbstractDocumentReader,
    DocumentContent,
    DocumentPage,
    ExtractedTable,
)
from app.services.extraction.parsers.layout_models import VisualLine, WordBox
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


class DOCXDocumentReader(AbstractDocumentReader):
    """Reader for Microsoft Word (.docx) laboratory reports."""

    def can_read(self, format_key: str) -> bool:
        return format_key == "docx"

    def read(self, content: bytes, original_filename: str = "") -> DocumentContent:
        pdf_bytes = storage_service.convert_docx_to_pdf(content, original_filename or "report.docx")

        extracted_text_lines: List[str] = []
        visual_lines: List[VisualLine] = []
        extracted_tables: List[ExtractedTable] = []
        y_cursor = 50.0

        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                if "word/document.xml" in zf.namelist():
                    tree = ET.fromstring(zf.read("word/document.xml"))
                    body = tree.find("w:body", DOCX_NS)
                    if body is not None:
                        for elem in body:
                            tag = elem.tag.split("}")[-1]
                            if tag == "p":
                                p_text = "".join(elem.itertext()).strip()
                                if p_text:
                                    extracted_text_lines.append(p_text)
                                    # Create VisualLine for paragraph
                                    words = []
                                    x_curr = 50.0
                                    for idx, w_str in enumerate(p_text.split()):
                                        w_len = len(w_str) * 6.5
                                        words.append(
                                            WordBox(
                                                text=w_str,
                                                x0=x_curr,
                                                y0=y_cursor,
                                                x1=x_curr + w_len,
                                                y1=y_cursor + 12.0,
                                                block_no=1,
                                                line_no=len(visual_lines) + 1,
                                                word_no=idx + 1,
                                            )
                                        )
                                        x_curr += w_len + 4.0

                                    visual_lines.append(
                                        VisualLine(
                                            words=words,
                                            text=p_text,
                                            page_number=1,
                                            y0=y_cursor,
                                            y1=y_cursor + 12.0,
                                            x0=50.0,
                                            x1=x_curr,
                                        )
                                    )
                                    y_cursor += 18.0

                            elif tag == "tbl":
                                tbl_rows: List[List[str]] = []
                                for tr in elem.findall("w:tr", DOCX_NS):
                                    row_cells = ["".join(tc.itertext()).strip() for tc in tr.findall("w:tc", DOCX_NS)]
                                    if any(row_cells):
                                        tbl_rows.append(row_cells)
                                        # Construct tabular visual line
                                        row_text = "   ".join(row_cells)
                                        extracted_text_lines.append(row_text)

                                        # Map cell positions to typical laboratory column bounds:
                                        # Col 0 (Test): x=50, Col 1 (Result): x=220, Col 2 (Unit): x=320, Col 3 (Ref): x=400
                                        col_x_offsets = [50.0, 220.0, 320.0, 400.0, 490.0]
                                        words = []
                                        for c_idx, c_val in enumerate(row_cells):
                                            c_x = col_x_offsets[c_idx] if c_idx < len(col_x_offsets) else 50.0 + (c_idx * 90.0)
                                            for w_idx, w_str in enumerate(c_val.split()):
                                                w_len = len(w_str) * 6.5
                                                words.append(
                                                    WordBox(
                                                        text=w_str,
                                                        x0=c_x + (w_idx * 15.0),
                                                        y0=y_cursor,
                                                        x1=c_x + (w_idx * 15.0) + w_len,
                                                        y1=y_cursor + 12.0,
                                                        block_no=2,
                                                        line_no=len(visual_lines) + 1,
                                                        word_no=len(words) + 1,
                                                    )
                                                )

                                        visual_lines.append(
                                            VisualLine(
                                                words=words,
                                                text=row_text,
                                                page_number=1,
                                                y0=y_cursor,
                                                y1=y_cursor + 12.0,
                                                x0=50.0,
                                                x1=540.0,
                                            )
                                        )
                                        y_cursor += 18.0

                                if tbl_rows:
                                    headers = tbl_rows[0] if len(tbl_rows) > 0 else []
                                    data_rows = tbl_rows[1:] if len(tbl_rows) > 1 else []
                                    extracted_tables.append(
                                        ExtractedTable(
                                            page_number=1,
                                            headers=headers,
                                            rows=data_rows,
                                        )
                                    )
                                y_cursor += 12.0

        except Exception as e:
            logger.error(f"Failed to read DOCX document: {e}")
            return DocumentContent(
                format="docx",
                page_count=1,
                has_text_layer=False,
                is_scanned=False,
                renderable_pdf_bytes=pdf_bytes,
                warning_message=f"Failed to extract document contents from DOCX: {e}",
            )

        full_text = "\n".join(extracted_text_lines)
        page = DocumentPage(
            page_number=1,
            text=full_text,
            visual_lines=visual_lines,
            tables=extracted_tables,
            char_count=len(full_text.strip()),
            has_text_layer=len(full_text.strip()) > 20,
            is_scanned=False,
        )

        return DocumentContent(
            format="docx",
            page_count=1,
            pages=[page],
            full_text=full_text,
            is_scanned=False,
            has_text_layer=True,
            total_characters=len(full_text.strip()),
            renderable_pdf_bytes=pdf_bytes,
            warning_message=None,
        )
