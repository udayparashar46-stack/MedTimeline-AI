"""Table-based column coordinate layout parsing strategy (Strategy 2).

Detects column headers (Test / Result / Units / Reference / Flag) and their bounding
horizontal coordinates, projecting individual word bounding boxes into tabular cells.
"""

import re
from typing import List, Optional, Dict, Tuple

from app.services.extraction.parsers.layout_models import (
    VisualLine,
    WordBox,
    ParsedRowCandidate,
    SkippedLine,
    LayoutStrategyResult,
)
from app.services.extraction.parsers.values import (
    parse_value_token,
    parse_reference_interval,
    is_abnormal_flag,
    is_known_unit,
)
from app.services.extraction.parsers.line_layout import (
    is_section_heading,
    is_non_result_line,
)



def detect_column_headers(line: VisualLine) -> Optional[Dict[str, Tuple[float, float]]]:
    """Detect table column headers from a visual line and return x-ranges for columns."""
    text_lower = line.text.lower()

    # Must contain both a test-name indicator and a result/value indicator
    has_test = any(k in text_lower for k in ["test", "investigation", "parameter", "examination"])
    has_result = any(k in text_lower for k in ["result", "value", "observed", "finding"])

    if not (has_test and has_result):
        return None

    # Identify individual header words and their x-coordinates
    col_bounds: Dict[str, Tuple[float, float]] = {}

    for word in line.words:
        w_lower = word.text.lower().strip(":,[]()")
        if w_lower in ["test", "investigation", "parameter"]:
            if "name" not in col_bounds:
                col_bounds["name"] = (word.x0 - 15, word.x1 + 30)
            else:
                col_bounds["name"] = (min(col_bounds["name"][0], word.x0 - 15), max(col_bounds["name"][1], word.x1 + 30))
        elif w_lower in ["result", "value", "observed"]:
            col_bounds["value"] = (word.x0 - 20, word.x1 + 25)
        elif w_lower in ["unit", "units"]:
            col_bounds["unit"] = (word.x0 - 15, word.x1 + 25)
        elif w_lower in ["reference", "ref", "biological", "normal", "range", "interval"]:
            if "reference" not in col_bounds:
                col_bounds["reference"] = (word.x0 - 15, word.x1 + 35)
            else:
                col_bounds["reference"] = (min(col_bounds["reference"][0], word.x0 - 15), max(col_bounds["reference"][1], word.x1 + 35))
        elif w_lower in ["flag", "status", "abnormal"]:
            col_bounds["flag"] = (word.x0 - 15, word.x1 + 25)

    if "name" in col_bounds and "value" in col_bounds:
        return col_bounds

    return None


def run_table_layout_strategy(visual_lines: List[VisualLine]) -> LayoutStrategyResult:
    """Execute column coordinate table layout strategy."""
    rows: List[ParsedRowCandidate] = []
    skipped: List[SkippedLine] = []

    current_section: Optional[str] = None
    active_headers: Optional[Dict[str, Tuple[float, float]]] = None
    row_order = 0
    buffer_test_name: Optional[str] = None

    for line in visual_lines:
        text = line.text.strip()

        # Check section heading
        if is_section_heading(text):
            current_section = text
            skipped.append(SkippedLine(page_number=line.page_number, text=text, reason="section_heading"))
            buffer_test_name = None
            continue

        # Check table header
        detected_headers = detect_column_headers(line)
        if detected_headers:
            active_headers = detected_headers
            skipped.append(SkippedLine(page_number=line.page_number, text=text, reason="table_header"))
            buffer_test_name = None
            continue

        # Non-result checks
        is_skip, reason = is_non_result_line(text)
        if is_skip and reason != "table_column_header":
            skipped.append(SkippedLine(page_number=line.page_number, text=text, reason=reason))
            buffer_test_name = None
            continue

        # If headers are active, bucket words by column coordinates
        if active_headers:
            words_name: List[str] = []
            words_val: List[str] = []
            words_unit: List[str] = []
            words_ref: List[str] = []
            words_flag: List[str] = []

            for w in line.words:
                cx = (w.x0 + w.x1) / 2.0

                # Check match against headers
                if "value" in active_headers and active_headers["value"][0] <= cx <= active_headers["value"][1] + 20:
                    words_val.append(w.text)
                elif "unit" in active_headers and active_headers["unit"][0] <= cx <= active_headers["unit"][1] + 20:
                    words_unit.append(w.text)
                elif "reference" in active_headers and active_headers["reference"][0] <= cx <= active_headers["reference"][1] + 30:
                    words_ref.append(w.text)
                elif "flag" in active_headers and active_headers["flag"][0] <= cx <= active_headers["flag"][1] + 20:
                    words_flag.append(w.text)
                elif cx < (active_headers.get("value", (200, 200))[0]):
                    words_name.append(w.text)

            name_str = " ".join(words_name).strip()
            val_str = " ".join(words_val).strip()

            # If wrapped test name (has name words but no value)
            if name_str and not val_str:
                buffer_test_name = f"{buffer_test_name} {name_str}".strip() if buffer_test_name else name_str
                continue

            # If we have a value and test name (including buffered)
            if val_str:
                full_test_name = f"{buffer_test_name} {name_str}".strip() if buffer_test_name else name_str
                buffer_test_name = None

                is_val, clean_val, num_val, comp, embedded_flag = parse_value_token(val_str)
                if is_val and full_test_name:
                    unit_str = " ".join(words_unit).strip() or None
                    ref_str = " ".join(words_ref).strip() or None
                    flag_str = " ".join(words_flag).strip() or embedded_flag

                    if unit_str and not is_known_unit(unit_str):
                        pass

                    # Confidence
                    if unit_str and ref_str:
                        conf = "high"
                    elif unit_str or ref_str or num_val is not None:
                        conf = "medium"
                    else:
                        conf = "low"

                    rows.append(
                        ParsedRowCandidate(
                            page_number=line.page_number,
                            row_order=row_order,
                            section_heading=current_section,
                            raw_test_name=full_test_name,
                            raw_value_text=clean_val or val_str,
                            raw_unit=unit_str,
                            raw_reference_text=ref_str,
                            printed_flag=flag_str,
                            source_snippet=text,
                            bbox=[line.x0, line.y0, line.x1, line.y1],
                            parse_confidence=conf,
                        )
                    )
                    row_order += 1
                    continue

        # If not parsed as table row, skip
        skipped.append(SkippedLine(page_number=line.page_number, text=text, reason="table_row_unmatched"))
        buffer_test_name = None

    high_c = sum(1 for r in rows if r.parse_confidence == "high")
    med_c = sum(1 for r in rows if r.parse_confidence == "medium")
    low_c = sum(1 for r in rows if r.parse_confidence == "low")

    return LayoutStrategyResult(
        strategy_name="table_layout",
        rows=rows,
        skipped_lines=skipped,
        high_count=high_c,
        medium_count=med_c,
        low_count=low_c,
    )
