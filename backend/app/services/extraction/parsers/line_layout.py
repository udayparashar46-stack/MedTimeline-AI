"""Line-based sequential row parsing strategy (Strategy 1).

Parses visual lines using deterministic regex, keyword classification, token inspection,
and test-name wrapping reconstruction. Does not require rigid column headers.
"""

import re
from typing import List, Optional, Tuple

from app.services.extraction.parsers.layout_models import (
    VisualLine,
    ParsedRowCandidate,
    SkippedLine,
    LayoutStrategyResult,
)
from app.services.extraction.parsers.values import (
    is_known_unit,
    is_abnormal_flag,
    is_qualitative_value,
    parse_value_token,
    parse_reference_interval,
)

# Common clinical section headings
SECTION_HEADER_REGEX = re.compile(
    r"^(?:complete blood count|cbc|hemogram|lipid profile|liver function|lft|renal function|rft|"
    r"kidney function|kft|biochemistry|hematology|urine examination|urinalysis|thyroid profile|"
    r"electrolyte panel|glucose panel|serology|immunology|coagulation profile|diabetic screen|"
    r"differential count|wbc differential|iron studies)\b",
    re.IGNORECASE,
)

# Common metadata labels to skip
METADATA_LINE_REGEX = re.compile(
    r"^(?:patient name|patient id|pt id|mrn|name|age|gender|sex|referred by|dr\.|doctor|"
    r"specimen|sample type|collected|collection date|reported|reporting date|printed|print date|"
    r"page\s+\d+|phone|hospital|clinic|diagnostic|laboratory|address|lab no|reg no|barcode|"
    r"investigation|test name|parameter|result|units?|ref(?:erence)?\s*(?:interval|range)?|flag|"
    r"bio\.?\s*ref\.?\s*interval|biological reference interval|status|method)\b",
    re.IGNORECASE,
)

# Common footer tokens to skip
FOOTER_LINE_REGEX = re.compile(
    r"^(?:end of report|verified by|pathologist|technician|signature|disclaimer|notes?:|"
    r"interpretation|comments?:|please correlate clinically|tested on|sample processed)\b",
    re.IGNORECASE,
)


def is_section_heading(text: str) -> bool:
    """Check if line is a clinical section heading."""
    cleaned = text.strip()
    if not cleaned:
        return False
    # Uppercase headers like "LIPID PROFILE" or matching known panels
    if SECTION_HEADER_REGEX.search(cleaned):
        return True
    if len(cleaned) < 50 and cleaned.isupper() and not any(ch.isdigit() for ch in cleaned):
        if any(w in cleaned.lower() for w in ["panel", "profile", "test", "tests", "examination", "count"]):
            return True
    return False


def is_non_result_line(text: str) -> Tuple[bool, str]:
    """Check if line is non-result metadata, table header, or footer."""
    cleaned = text.strip()
    if not cleaned or len(cleaned) < 3:
        return True, "empty_or_short"

    if FOOTER_LINE_REGEX.search(cleaned):
        return True, "report_footer"

    if METADATA_LINE_REGEX.search(cleaned):
        # Exception: some tests might have "Test" in name, but if line contains column header pattern
        lower = cleaned.lower()
        if ("result" in lower or "value" in lower) and ("unit" in lower or "ref" in lower):
            return True, "table_column_header"
        if any(k in lower for k in ["patient name", "mrn", "collected", "reported", "page ", "referred by"]):
            return True, "page_metadata"

    return False, ""


def parse_line_tokens(
    line: VisualLine,
    section_heading: Optional[str],
    row_order: int,
) -> Tuple[Optional[ParsedRowCandidate], Optional[SkippedLine]]:
    """Parse a single visual line into a ParsedRowCandidate if valid."""
    raw_text = line.text.strip()

    # Step 1: Split line into space-delimited tokens
    tokens = raw_text.split()
    if len(tokens) < 2:
        return None, SkippedLine(page_number=line.page_number, text=raw_text, reason="too_few_tokens")

    # Step 2: Locate the result value token
    # We scan tokens from left to right, looking for the first candidate result value.
    # A test name is at least 1 token at the start.
    value_idx = -1
    raw_val_str = ""
    parsed_num = None
    parsed_comp = None
    parsed_flag = None

    for i in range(1, len(tokens)):
        token = tokens[i]
        is_val, v_str, v_num, v_comp, v_flag = parse_value_token(token)
        if is_val:
            # Check if immediately preceded by a comparator token (e.g. ['<', '0.5'])
            if i > 1 and tokens[i - 1] in ["<", ">", "<=", ">="]:
                value_idx = i - 1
                raw_val_str = f"{tokens[i - 1]} {v_str or token}"
                parsed_comp = tokens[i - 1]
                parsed_num = v_num
                parsed_flag = v_flag
            else:
                value_idx = i
                raw_val_str = v_str or token
                parsed_num = v_num
                parsed_comp = v_comp
                parsed_flag = v_flag
            break

    # If no single token matched, check if tokens[i:i+2] or qualitative value matches (e.g. "Not Detected")
    if value_idx == -1:
        for i in range(1, len(tokens)):
            # Check comparator with spaced number e.g. ["<", "0.05"]
            if tokens[i] in ["<", ">", "<=", ">="] and i + 1 < len(tokens):
                is_num, _, v_num, _, _ = parse_value_token(tokens[i + 1])
                if is_num:
                    value_idx = i
                    raw_val_str = f"{tokens[i]} {tokens[i + 1]}"
                    parsed_comp = tokens[i]
                    parsed_num = v_num
                    break
            # Check two-word qualitative e.g. "Not Detected"
            if i + 1 < len(tokens):
                two_word = f"{tokens[i]} {tokens[i + 1]}".lower()
                if is_qualitative_value(two_word):
                    value_idx = i
                    raw_val_str = f"{tokens[i]} {tokens[i + 1]}"
                    break


    if value_idx == -1:
        return None, SkippedLine(
            page_number=line.page_number, text=raw_text, reason="no_value_token_found"
        )

    # Test Name is all tokens preceding the value
    test_name_tokens = tokens[:value_idx]
    test_name = " ".join(test_name_tokens).strip()

    # Reject if test name looks like pure metadata (e.g. "Date:", "Page:")
    if re.match(r"^(?:date|page|time|doctor|patient|sample|mrn|lab):?$", test_name, re.IGNORECASE):
        return None, SkippedLine(page_number=line.page_number, text=raw_text, reason="metadata_line")

    # Remaining tokens after the value: unit, reference interval, and flag
    remainder_tokens = (
        tokens[value_idx + 1:] if parsed_comp is None or " " not in raw_val_str else tokens[value_idx + 2:]
    )
    if is_qualitative_value(raw_val_str.lower()) and " " in raw_val_str:
        remainder_tokens = tokens[value_idx + 2:]

    unit_str: Optional[str] = None
    ref_str: Optional[str] = None
    flag_str: Optional[str] = parsed_flag

    # Scan remainder tokens
    rem_idx = 0
    rem_len = len(remainder_tokens)

    while rem_idx < rem_len:
        tok = remainder_tokens[rem_idx]

        # Check for abnormal flag
        if is_abnormal_flag(tok) and not flag_str:
            flag_str = tok.upper()
            rem_idx += 1
            continue

        # Check for unit
        if is_known_unit(tok) and not unit_str:
            unit_str = tok
            rem_idx += 1
            continue

        # Check for reference interval e.g. "13.0 - 17.0" or "< 200"
        # Can be 1 token ("13.0-17.0") or 2-3 tokens ("13.0", "-", "17.0") or ("<", "200")
        combined_3 = " ".join(remainder_tokens[rem_idx:rem_idx + 3])
        is_ref, _, _, _ = parse_reference_interval(combined_3)
        if is_ref:
            ref_str = combined_3
            rem_idx += 3
            continue

        combined_2 = " ".join(remainder_tokens[rem_idx:rem_idx + 2])
        is_ref, _, _, _ = parse_reference_interval(combined_2)
        if is_ref:
            ref_str = combined_2
            rem_idx += 2
            continue

        is_ref, _, _, _ = parse_reference_interval(tok)
        if is_ref:
            ref_str = tok
            rem_idx += 1
            continue

        # If not matched, could be unit without standard dictionary or trailing flag
        if not unit_str and not any(ch.isdigit() for ch in tok) and len(tok) < 15:
            unit_str = tok
            rem_idx += 1
            continue

        rem_idx += 1

    # Confidence calculation:
    # high: test name + numeric/qualitative value + unit + reference range
    # medium: test name + value, but missing unit or range
    # low: structurally odd or missing test name
    if not test_name or len(test_name) < 2:
        confidence = "low"
    elif unit_str and ref_str:
        confidence = "high"
    elif unit_str or ref_str:
        confidence = "medium"
    elif parsed_num is not None or is_qualitative_value(raw_val_str.lower()):
        confidence = "medium"
    else:
        confidence = "low"

    candidate = ParsedRowCandidate(
        page_number=line.page_number,
        row_order=row_order,
        section_heading=section_heading,
        raw_test_name=test_name,
        raw_value_text=raw_val_str,
        raw_unit=unit_str,
        raw_reference_text=ref_str,
        printed_flag=flag_str,
        source_snippet=raw_text,
        bbox=[line.x0, line.y0, line.x1, line.y1],
        parse_confidence=confidence,
    )

    return candidate, None


def run_line_layout_strategy(visual_lines: List[VisualLine]) -> LayoutStrategyResult:
    """Execute line-by-line sequential parsing strategy across all pages."""
    rows: List[ParsedRowCandidate] = []
    skipped: List[SkippedLine] = []

    current_section: Optional[str] = None
    row_order = 0
    buffer_wrapped_name: Optional[str] = None

    i = 0
    total_lines = len(visual_lines)

    while i < total_lines:
        line = visual_lines[i]
        text = line.text.strip()

        # Check section heading
        if is_section_heading(text):
            current_section = text
            skipped.append(SkippedLine(page_number=line.page_number, text=text, reason="section_heading"))
            buffer_wrapped_name = None
            i += 1
            continue

        # Check non-result lines
        is_skip, reason = is_non_result_line(text)
        if is_skip:
            skipped.append(SkippedLine(page_number=line.page_number, text=text, reason=reason))
            buffer_wrapped_name = None
            i += 1
            continue

        # If previous line was buffered as a partial test name, prepend it
        if buffer_wrapped_name:
            line_text_to_parse = f"{buffer_wrapped_name} {text}"
            temp_line = VisualLine(
                words=line.words,
                text=line_text_to_parse,
                page_number=line.page_number,
                y0=line.y0,
                y1=line.y1,
                x0=line.x0,
                x1=line.x1,
            )
            buffer_wrapped_name = None
            candidate, skip_item = parse_line_tokens(temp_line, current_section, row_order)
        else:
            candidate, skip_item = parse_line_tokens(line, current_section, row_order)

        if candidate:
            rows.append(candidate)
            row_order += 1
        elif skip_item:
            # Check if this line might be a wrapped test name prefix:
            # A line with only letters/words, no digits, no comparators, len < 40,
            # and next line exists and has a value token
            if (
                i + 1 < total_lines
                and not any(ch.isdigit() for ch in text)
                and len(text) < 45
                and not is_section_heading(text)
            ):
                next_line = visual_lines[i + 1]
                next_cand, _ = parse_line_tokens(next_line, current_section, row_order)
                if next_cand:
                    # Yes, buffer current line as wrapped test name!
                    buffer_wrapped_name = text
                    i += 1
                    continue

            skipped.append(skip_item)

        i += 1

    high_c = sum(1 for r in rows if r.parse_confidence == "high")
    med_c = sum(1 for r in rows if r.parse_confidence == "medium")
    low_c = sum(1 for r in rows if r.parse_confidence == "low")

    return LayoutStrategyResult(
        strategy_name="line_layout",
        rows=rows,
        skipped_lines=skipped,
        high_count=high_c,
        medium_count=med_c,
        low_count=low_c,
    )
