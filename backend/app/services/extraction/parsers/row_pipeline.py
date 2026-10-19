"""Row extraction pipeline orchestrator.

Extracts visual lines with word coordinates from PyMuPDF, runs layout parsing strategies,
selects the winning layout strategy, and packages extracted rows with confidence scoring.
"""

from dataclasses import dataclass
from typing import List, Tuple
import fitz  # PyMuPDF

from app.services.extraction.parsers.layout_models import (
    WordBox,
    VisualLine,
    ParsedRowCandidate,
    LayoutStrategyResult,
)
from app.services.extraction.parsers.line_layout import run_line_layout_strategy
from app.services.extraction.parsers.table_layout import run_table_layout_strategy


@dataclass
class RowPipelineResult:
    strategy_used: str
    rows: List[ParsedRowCandidate]
    total_rows: int
    needs_review_count: int
    high_count: int
    medium_count: int
    low_count: int
    skipped_lines_count: int


def reconstruct_visual_lines_from_doc(doc: fitz.Document) -> List[VisualLine]:
    """Reconstruct visual lines from PyMuPDF document keeping word coordinates."""
    visual_lines: List[VisualLine] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_num = page_idx + 1

        # Extract words: (x0, y0, x1, y1, word_text, block_no, line_no, word_no)
        raw_words = page.get_text("words")
        if not raw_words:
            continue

        # Convert to WordBox objects
        word_boxes = [
            WordBox(
                text=w[4],
                x0=w[0],
                y0=w[1],
                x1=w[2],
                y1=w[3],
                block_no=w[5],
                line_no=w[6],
                word_no=w[7],
            )
            for w in raw_words
        ]

        # Group words into horizontal lines by y-coordinate
        # Sort words primarily by y0, secondarily by x0
        word_boxes.sort(key=lambda w: (w.y0, w.x0))

        lines_for_page: List[List[WordBox]] = []
        for word in word_boxes:
            matched_line = False
            for line_words in lines_for_page:
                # If word's vertical midpoint or y0 is within 3.5 points of the line's y0
                ref_y = line_words[0].y0
                if abs(word.y0 - ref_y) <= 3.5 or (word.y0 <= line_words[0].y1 and word.y1 >= line_words[0].y0):
                    line_words.append(word)
                    matched_line = True
                    break

            if not matched_line:
                lines_for_page.append([word])

        # Sort lines vertically
        lines_for_page.sort(key=lambda lw: lw[0].y0)

        # Build VisualLine objects with words sorted horizontally
        for line_words in lines_for_page:
            line_words.sort(key=lambda w: w.x0)
            line_text = " ".join(w.text for w in line_words).strip()
            if not line_text:
                continue

            v_line = VisualLine(
                words=line_words,
                text=line_text,
                page_number=page_num,
                y0=min(w.y0 for w in line_words),
                y1=max(w.y1 for w in line_words),
                x0=min(w.x0 for w in line_words),
                x1=max(w.x1 for w in line_words),
            )
            visual_lines.append(v_line)

    return visual_lines


def extract_rows_from_pdf_doc(doc: fitz.Document) -> RowPipelineResult:
    """Extract rows from PyMuPDF document using layout strategies."""
    visual_lines = reconstruct_visual_lines_from_doc(doc)
    if not visual_lines:
        return RowPipelineResult(
            strategy_used="none",
            rows=[],
            total_rows=0,
            needs_review_count=0,
            high_count=0,
            medium_count=0,
            low_count=0,
            skipped_lines_count=0,
        )

    # Strategy 1: Table column coordinate strategy
    res_table = run_table_layout_strategy(visual_lines)

    # Strategy 2: Sequential line token strategy
    res_line = run_line_layout_strategy(visual_lines)

    # Select the winning strategy:
    # Prefer table_layout if it extracted high/medium confidence rows
    if res_table.total_rows > 0 and res_table.score >= res_line.score:
        winning = res_table
    elif res_line.total_rows > 0:
        winning = res_line
    elif res_table.total_rows > 0:
        winning = res_table
    else:
        winning = res_line

    return RowPipelineResult(
        strategy_used=winning.strategy_name,
        rows=winning.rows,
        total_rows=winning.total_rows,
        needs_review_count=winning.total_rows,  # all newly extracted rows need review
        high_count=winning.high_count,
        medium_count=winning.medium_count,
        low_count=winning.low_count,
        skipped_lines_count=len(winning.skipped_lines),
    )


def extract_rows_from_pdf_bytes(pdf_bytes: bytes) -> RowPipelineResult:
    """Extract rows directly from raw PDF bytes."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return extract_rows_from_pdf_doc(doc)
    finally:
        doc.close()
