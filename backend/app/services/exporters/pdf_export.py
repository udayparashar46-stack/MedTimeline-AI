"""PDF Exporter service (Milestone 10).

Follows blueprint Section 2.3, Section 8, Section 10.1, Section 11:
- Landscape print-friendly A4 PDF (842 x 595 pt).
- Header with Patient label, generation timestamp, filter mode, and pagination ("Page X of Y").
- Table headers repeated on each page.
- Test rows with canonical/test names, units, and categories.
- Chronological report date columns (ascending order).
- Blank cells for missing results (never invented or interpolated numbers).
- Cell highlighting for out-of-range flags (soft tints for H/L).
- Handles wide tables (column chunking) and tall tables (multi-page row pagination).
- Mandatory medical disclaimer footer on every page:
  "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
"""

import math
from datetime import datetime, timezone
from typing import List, Tuple, Optional
import fitz  # PyMuPDF
from sqlalchemy.orm import Session

from app.schemas.timeline import TimelineResponse, TimelineReportColumn, TimelineRow
from app.services.timeline import build_patient_timeline

# Design system color tokens (RGB floats 0.0 - 1.0)
COLOR_TEAL_PRIMARY = (0.059, 0.463, 0.431)      # #0F766E
COLOR_TEAL_SOFT = (0.847, 0.941, 0.929)         # #D8F0ED
COLOR_TEXT_PRIMARY = (0.059, 0.106, 0.176)      # #0F1B2D
COLOR_TEXT_MUTED = (0.357, 0.420, 0.498)        # #5B6B7F
COLOR_BORDER = (0.890, 0.906, 0.929)            # #E3E7ED
COLOR_SURFACE_MUTED = (0.941, 0.949, 0.961)     # #F0F2F5
COLOR_FLAG_HIGH_BG = (0.992, 0.910, 0.902)      # #FDE8E6
COLOR_FLAG_HIGH_TXT = (0.706, 0.137, 0.094)     # #B42318
COLOR_FLAG_LOW_BG = (0.902, 0.941, 0.992)       # #E6F0FD
COLOR_FLAG_LOW_TXT = (0.114, 0.306, 0.847)      # #1D4ED8
COLOR_WHITE = (1.0, 1.0, 1.0)
COLOR_ZEBRA = (0.984, 0.988, 0.992)

# Page layout constants (points)
PAGE_WIDTH = 842.0   # A4 Landscape width
PAGE_HEIGHT = 595.0  # A4 Landscape height
MARGIN_LEFT = 36.0
MARGIN_RIGHT = 36.0
MARGIN_TOP = 32.0
BOTTOM_LIMIT = 540.0
FOOTER_Y = 565.0

FIRST_COL_WIDTH = 175.0
MAX_COLS_PER_CHUNK = 5
ROW_HEIGHT = 20.0
CATEGORY_ROW_HEIGHT = 18.0
HEADER_ROW_HEIGHT = 28.0

DISCLAIMER_TEXT = (
    "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
)


def _draw_page_header(
    page: fitz.Page,
    matrix: TimelineResponse,
    page_num: int,
    total_pages_placeholder: str,
    chunk_index: int,
    total_chunks: int,
    generated_at_str: str,
) -> float:
    """Draw document banner, patient label, and metadata at the top of a page."""
    # Top rule / accent band
    page.draw_rect(
        fitz.Rect(MARGIN_LEFT, MARGIN_TOP, PAGE_WIDTH - MARGIN_RIGHT, MARGIN_TOP + 4),
        color=COLOR_TEAL_PRIMARY,
        fill=COLOR_TEAL_PRIMARY,
    )

    y = MARGIN_TOP + 18.0

    # Title
    page.insert_text(
        fitz.Point(MARGIN_LEFT, y),
        "MedTimeline AI",
        fontname="hebo",
        fontsize=14,
        color=COLOR_TEAL_PRIMARY,
    )
    page.insert_text(
        fitz.Point(MARGIN_LEFT + 120, y - 1),
        "— Laboratory History & Timeline",
        fontname="helv",
        fontsize=10,
        color=COLOR_TEXT_MUTED,
    )

    # Right-aligned header metadata
    filter_label = (
        "Confirmed & Unreviewed Drafts" if matrix.include_unreviewed else "Confirmed Results Only"
    )
    meta_line1 = f"Generated: {generated_at_str}"
    meta_line2 = f"Filter: {filter_label}"

    page.insert_text(
        fitz.Point(PAGE_WIDTH - MARGIN_RIGHT - 180, y - 4),
        meta_line1,
        fontname="helv",
        fontsize=7.5,
        color=COLOR_TEXT_MUTED,
    )
    page.insert_text(
        fitz.Point(PAGE_WIDTH - MARGIN_RIGHT - 180, y + 6),
        meta_line2,
        fontname="helv",
        fontsize=7.5,
        color=COLOR_TEXT_MUTED,
    )

    y += 18.0

    # Patient info bar
    patient_text = f"Patient Workspace: {matrix.patient_name}"
    page.insert_text(
        fitz.Point(MARGIN_LEFT, y),
        patient_text,
        fontname="hebo",
        fontsize=10,
        color=COLOR_TEXT_PRIMARY,
    )

    # Columns chunk note if multi-chunk
    if total_chunks > 1:
        chunk_note = f"(Dates segment {chunk_index + 1} of {total_chunks})"
        page.insert_text(
            fitz.Point(MARGIN_LEFT + 260, y),
            chunk_note,
            fontname="heit",
            fontsize=8.5,
            color=COLOR_TEXT_MUTED,
        )

    # Page number placeholder (stamped on final pass)
    page_str = f"Page {page_num} of {total_pages_placeholder}"
    page.insert_text(
        fitz.Point(PAGE_WIDTH - MARGIN_RIGHT - 180, y),
        page_str,
        fontname="helv",
        fontsize=8.0,
        color=COLOR_TEXT_MUTED,
    )

    y += 12.0
    # Divider line
    page.draw_line(
        fitz.Point(MARGIN_LEFT, y),
        fitz.Point(PAGE_WIDTH - MARGIN_RIGHT, y),
        color=COLOR_BORDER,
        width=0.75,
    )

    return y + 8.0  # Returns start Y for the table


def _draw_page_footer(page: fitz.Page) -> None:
    """Draw the mandatory medical disclaimer footer and bottom divider."""
    # Divider line
    page.draw_line(
        fitz.Point(MARGIN_LEFT, FOOTER_Y - 10),
        fitz.Point(PAGE_WIDTH - MARGIN_RIGHT, FOOTER_Y - 10),
        color=COLOR_BORDER,
        width=0.75,
    )

    # Centered disclaimer
    page.insert_text(
        fitz.Point(MARGIN_LEFT, FOOTER_Y + 2),
        DISCLAIMER_TEXT,
        fontname="heit",
        fontsize=8.0,
        color=COLOR_TEXT_MUTED,
    )


def _draw_table_headers(
    page: fitz.Page,
    start_y: float,
    chunk_columns: List[TimelineReportColumn],
    col_width: float,
) -> float:
    """Draw repeated table header row with Test name column and report date columns."""
    y = start_y
    h = HEADER_ROW_HEIGHT
    total_w = FIRST_COL_WIDTH + (len(chunk_columns) * col_width)

    # Background rect
    page.draw_rect(
        fitz.Rect(MARGIN_LEFT, y, MARGIN_LEFT + total_w, y + h),
        color=COLOR_BORDER,
        fill=COLOR_SURFACE_MUTED,
        width=0.5,
    )

    # First col header
    page.insert_text(
        fitz.Point(MARGIN_LEFT + 8, y + 13),
        "Test / Analyte",
        fontname="hebo",
        fontsize=9,
        color=COLOR_TEXT_PRIMARY,
    )
    page.insert_text(
        fitz.Point(MARGIN_LEFT + 8, y + 23),
        "Standard Unit",
        fontname="helv",
        fontsize=7,
        color=COLOR_TEXT_MUTED,
    )

    # Column dividers and date labels
    for idx, col in enumerate(chunk_columns):
        cx = MARGIN_LEFT + FIRST_COL_WIDTH + (idx * col_width)
        # Vertical divider
        page.draw_line(
            fitz.Point(cx, y),
            fitz.Point(cx, y + h),
            color=COLOR_BORDER,
            width=0.5,
        )

        date_text = col.report_date or "No Date"
        if col.report_date_confirmed:
            status_tag = "(confirmed)"
        else:
            status_tag = "(unconfirmed)"

        # Lab or file label truncated
        lab_label = col.lab_name or col.original_filename
        if len(lab_label) > 16:
            lab_label = lab_label[:14] + ".."

        page.insert_text(
            fitz.Point(cx + 6, y + 11),
            date_text,
            fontname="hebo",
            fontsize=8.5,
            color=COLOR_TEXT_PRIMARY,
        )
        page.insert_text(
            fitz.Point(cx + 6, y + 20),
            lab_label,
            fontname="helv",
            fontsize=7,
            color=COLOR_TEXT_MUTED,
        )
        page.insert_text(
            fitz.Point(cx + 6, y + 26),
            status_tag,
            fontname="heit",
            fontsize=6,
            color=COLOR_TEAL_PRIMARY if col.report_date_confirmed else COLOR_TEXT_MUTED,
        )

    # Right outer border
    right_x = MARGIN_LEFT + total_w
    page.draw_line(
        fitz.Point(right_x, y),
        fitz.Point(right_x, y + h),
        color=COLOR_BORDER,
        width=0.5,
    )

    return y + h


def export_patient_timeline_pdf(
    db: Session,
    patient_id: str,
    include_unreviewed: bool = False,
) -> Tuple[bytes, str]:
    """Generate landscape print-friendly PDF of patient timeline matrix."""
    matrix = build_patient_timeline(db, patient_id=patient_id, include_unreviewed=include_unreviewed)

    doc = fitz.open()
    generated_at_str = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    # Column chunking: split columns into chunks of MAX_COLS_PER_CHUNK
    total_columns = len(matrix.columns)
    if total_columns == 0:
        column_chunks = [[]]
    else:
        column_chunks = [
            matrix.columns[i : i + MAX_COLS_PER_CHUNK]
            for i in range(0, total_columns, MAX_COLS_PER_CHUNK)
        ]

    total_chunks = len(column_chunks)
    available_table_w = (PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT) - FIRST_COL_WIDTH

    current_page_num = 0

    # If completely empty workspace (no tests or no reports)
    if not matrix.rows or not matrix.columns:
        current_page_num += 1
        page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        y = _draw_page_header(
            page, matrix, current_page_num, "1", 0, 1, generated_at_str
        )
        _draw_page_footer(page)

        # Draw empty state message
        empty_rect = fitz.Rect(MARGIN_LEFT, y + 40, PAGE_WIDTH - MARGIN_RIGHT, y + 120)
        page.draw_rect(empty_rect, color=COLOR_BORDER, fill=COLOR_SURFACE_MUTED, width=0.5)
        page.insert_text(
            fitz.Point(MARGIN_LEFT + 20, y + 75),
            "No laboratory results available to display in timeline.",
            fontname="hebo",
            fontsize=11,
            color=COLOR_TEXT_PRIMARY,
        )
        page.insert_text(
            fitz.Point(MARGIN_LEFT + 20, y + 95),
            "Upload and review patient lab reports to view chronological results.",
            fontname="helv",
            fontsize=9,
            color=COLOR_TEXT_MUTED,
        )

        pdf_bytes = doc.tobytes()
        safe_name = "".join(c for c in matrix.patient_name if c.isalnum() or c in ("-", "_")).strip() or "patient"
        return pdf_bytes, f"{safe_name}_lab_timeline.pdf"

    # Render each column chunk
    for chunk_idx, chunk_cols in enumerate(column_chunks):
        num_chunk_cols = max(len(chunk_cols), 1)
        col_w = min(available_table_w / num_chunk_cols, 120.0)
        total_table_w = FIRST_COL_WIDTH + (len(chunk_cols) * col_w)

        # Track categories to draw category headers
        current_category = None
        row_idx = 0
        total_rows = len(matrix.rows)

        while row_idx < total_rows:
            # Create a new page
            current_page_num += 1
            page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)

            # Draw Header and Footer
            y = _draw_page_header(
                page, matrix, current_page_num, "TOTAL", chunk_idx, total_chunks, generated_at_str
            )
            _draw_page_footer(page)

            # Draw table column headers
            y = _draw_table_headers(page, y, chunk_cols, col_w)

            # Draw data rows until bottom limit is reached
            is_zebra = False
            while row_idx < total_rows:
                row_data = matrix.rows[row_idx]

                # Check if category changed
                if row_data.category != current_category:
                    # Category banner row
                    if y + CATEGORY_ROW_HEIGHT > BOTTOM_LIMIT:
                        break  # Break to next page

                    current_category = row_data.category
                    cat_rect = fitz.Rect(MARGIN_LEFT, y, MARGIN_LEFT + total_table_w, y + CATEGORY_ROW_HEIGHT)
                    page.draw_rect(cat_rect, color=COLOR_BORDER, fill=COLOR_TEAL_SOFT, width=0.5)

                    cat_title = current_category.upper()
                    page.insert_text(
                        fitz.Point(MARGIN_LEFT + 8, y + 12),
                        f"■ {cat_title}",
                        fontname="hebo",
                        fontsize=7.5,
                        color=COLOR_TEAL_PRIMARY,
                    )
                    y += CATEGORY_ROW_HEIGHT

                # Check if next data row fits
                if y + ROW_HEIGHT > BOTTOM_LIMIT:
                    break  # Break to next page

                # Draw Data Row
                row_rect = fitz.Rect(MARGIN_LEFT, y, MARGIN_LEFT + total_table_w, y + ROW_HEIGHT)
                row_fill = COLOR_ZEBRA if is_zebra else COLOR_WHITE
                page.draw_rect(row_rect, color=COLOR_BORDER, fill=row_fill, width=0.5)

                # Test name and unit in first column
                display_name = row_data.test_name
                if len(display_name) > 28:
                    display_name = display_name[:26] + ".."

                page.insert_text(
                    fitz.Point(MARGIN_LEFT + 8, y + 12),
                    display_name,
                    fontname="hebo" if row_data.is_canonical else "helv",
                    fontsize=8.0,
                    color=COLOR_TEXT_PRIMARY,
                )

                unit_str = row_data.preferred_unit or (row_data.observed_units[0] if row_data.observed_units else "")
                if unit_str:
                    page.insert_text(
                        fitz.Point(MARGIN_LEFT + 8, y + 18),
                        unit_str,
                        fontname="helv",
                        fontsize=6.5,
                        color=COLOR_TEXT_MUTED,
                    )

                # Cells for each report in this chunk
                for col_i, col in enumerate(chunk_cols):
                    cx = MARGIN_LEFT + FIRST_COL_WIDTH + (col_i * col_w)
                    cell = row_data.cells.get(col.report_id)

                    # Vertical border
                    page.draw_line(
                        fitz.Point(cx, y),
                        fitz.Point(cx, y + ROW_HEIGHT),
                        color=COLOR_BORDER,
                        width=0.5,
                    )

                    if cell:
                        cell_rect = fitz.Rect(cx + 0.5, y + 0.5, cx + col_w - 0.5, y + ROW_HEIGHT - 0.5)
                        txt_color = COLOR_TEXT_PRIMARY
                        val_font = "hebo" if (cell.printed_flag in ("H", "L")) else "helv"

                        # Out-of-range flag highlighting
                        if cell.printed_flag == "H":
                            page.draw_rect(cell_rect, color=COLOR_FLAG_HIGH_BG, fill=COLOR_FLAG_HIGH_BG)
                            txt_color = COLOR_FLAG_HIGH_TXT
                        elif cell.printed_flag == "L":
                            page.draw_rect(cell_rect, color=COLOR_FLAG_LOW_BG, fill=COLOR_FLAG_LOW_BG)
                            txt_color = COLOR_FLAG_LOW_TXT

                        # Value text
                        val_text = cell.effective_value_text
                        if cell.printed_flag:
                            val_text = f"{val_text} {cell.printed_flag}"

                        # Draft indication
                        if cell.review_status == "unreviewed":
                            val_text = f"{val_text}*"

                        page.insert_text(
                            fitz.Point(cx + 6, y + 13),
                            val_text,
                            fontname=val_font,
                            fontsize=8.0,
                            color=txt_color,
                        )

                        # Secondary details (source page, edit dot)
                        sub_details = f"p.{cell.page_number}"
                        if cell.is_edited:
                            sub_details += " • edited"
                        page.insert_text(
                            fitz.Point(cx + 6, y + 18),
                            sub_details,
                            fontname="helv",
                            fontsize=5.5,
                            color=COLOR_TEXT_MUTED,
                        )
                    else:
                        # Truly blank cell! Guaranteed zero invented numbers (Principle 1)
                        pass

                y += ROW_HEIGHT
                is_zebra = not is_zebra
                row_idx += 1

    # Second pass: stamp the accurate total pages on each page
    total_pages = doc.page_count
    for p_idx in range(total_pages):
        page = doc[p_idx]
        p_num = p_idx + 1
        page_str = f"Page {p_num} of {total_pages}"
        # Erase previous placeholder with small background fill
        num_rect = fitz.Rect(PAGE_WIDTH - MARGIN_RIGHT - 185, MARGIN_TOP + 35, PAGE_WIDTH - MARGIN_RIGHT, MARGIN_TOP + 48)
        page.draw_rect(num_rect, color=COLOR_WHITE, fill=COLOR_WHITE)
        page.insert_text(
            fitz.Point(PAGE_WIDTH - MARGIN_RIGHT - 180, MARGIN_TOP + 46),
            page_str,
            fontname="helv",
            fontsize=8.0,
            color=COLOR_TEXT_MUTED,
        )

    pdf_bytes = doc.tobytes()
    safe_name = "".join(c for c in matrix.patient_name if c.isalnum() or c in ("-", "_")).strip() or "patient"
    filename = f"{safe_name}_lab_timeline.pdf"

    return pdf_bytes, filename
