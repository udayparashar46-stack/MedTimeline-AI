"""Report date detection and disambiguation service.

Follows blueprint Section 9.1:
- Searches for labeled dates first:
  * Priority 1 (Collection): "Collected", "Sample Date", "Specimen Date", "Drawn"
  * Priority 2 (Received): "Received", "Registered", "Accession Date"
  * Priority 3 (Reported): "Reported", "Result Date", "Completed"
  * Priority 4 (Printed/Other): "Printed", "Generated On", or unlabeled
- Strictly prefers collection/sample date over report or print dates.
- Detects multiple common date formats:
  * DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  * YYYY-MM-DD
  * DD Mon YYYY, DD Month YYYY (e.g., 18 Oct 2026, 18-October-2026)
  * Month DD, YYYY (e.g., October 18, 2026, Oct 18, 2026)
- Flags ambiguous dates:
  * Multiple different dates in the same highest-priority category
  * Symmetrical numeric dates (e.g. 03/04/2026) where day-first vs month-first yields different dates
- Retains alternatives for user confirmation; never silently chooses an unreliable date.
"""

import re
from dataclasses import dataclass, asdict
from datetime import date, datetime
from typing import List, Optional, Tuple


MONTH_NAMES = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

PRIORITY_COLLECTION = 1
PRIORITY_RECEIVED = 2
PRIORITY_REPORTED = 3
PRIORITY_PRINTED = 4
PRIORITY_UNLABELED = 5

LABEL_PRIORITIES = [
    (
        PRIORITY_COLLECTION,
        "collection",
        re.compile(
            r"\b(col(?:lect(?:ed|ion)?)?|sample(?:d)?|specimen|draw(?:n)?)(?:\s+(?:date|time|on|at))?\s*[:\-]?\s*",
            re.IGNORECASE,
        ),
    ),
    (
        PRIORITY_RECEIVED,
        "received",
        re.compile(
            r"\b(rec(?:eived)?|reg(?:istered)?|accession|intake)(?:\s+(?:date|time|on|at))?\s*[:\-]?\s*",
            re.IGNORECASE,
        ),
    ),
    (
        PRIORITY_REPORTED,
        "reported",
        re.compile(
            r"\b(rep(?:ort(?:ed)?)?|result|completed|verified|authorized)(?:\s+(?:date|time|on|at))?\s*[:\-]?\s*",
            re.IGNORECASE,
        ),
    ),
    (
        PRIORITY_PRINTED,
        "printed",
        re.compile(
            r"\b(print(?:ed)?|generated)(?:\s+(?:date|time|on|at))?\s*[:\-]?\s*",
            re.IGNORECASE,
        ),
    ),
]


@dataclass
class DateCandidate:
    date_iso: str  # YYYY-MM-DD
    source_text: str  # e.g. "Collected: 18 Oct 2026"
    label_type: str  # "collection" | "received" | "reported" | "printed" | "unlabeled"
    priority: int
    confidence: str  # "high" | "medium" | "low"
    is_ambiguous_numeric: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DateDetectionResult:
    detected_date: Optional[str]  # YYYY-MM-DD
    source_text: Optional[str]
    is_ambiguous: bool
    alternatives: List[DateCandidate]
    confidence: str  # "high" | "medium" | "low" | "none"


def _safe_date(year: int, month: int, day: int) -> Optional[date]:
    """Validate calendar ranges and reasonable year boundaries."""
    if not (1920 <= year <= datetime.now().year + 2):
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _parse_date_string(raw: str) -> List[Tuple[date, bool]]:
    """Try parsing a date string.

    Returns list of (date_obj, is_ambiguous_numeric_order).
    """
    raw = raw.strip()

    # 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
    m_iso = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", raw)
    if m_iso:
        y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
        dt = _safe_date(y, m, d)
        if dt:
            return [(dt, False)]

    # 2. Text month formats: e.g. "18 Oct 2026", "18-October-2026", "18.Oct.2026"
    m_text = re.match(
        r"^(\d{1,2})[\s\-/.]([a-zA-Z]{3,9})(?:,\s*|[\s\-/.],?\s*)(\d{2,4})$", raw
    )
    if m_text:
        day_str, mon_str, year_str = m_text.group(1), m_text.group(2), m_text.group(3)
        mon_num = MONTH_NAMES.get(mon_str.lower().rstrip("."))
        if mon_num:
            year_num = int(year_str)
            if year_num < 100:
                year_num += 2000
            dt = _safe_date(year_num, mon_num, int(day_str))
            if dt:
                return [(dt, False)]

    # 3. US Text month format: "Oct 18, 2026", "October 18, 2026", "Oct. 18, 2026"
    m_us_text = re.match(
        r"^([a-zA-Z]{3,9})\.?[\s\-/.],?\s*(\d{1,2})(?:,\s*|[\s\-/.],?\s*)(\d{2,4})$", raw
    )
    if m_us_text:
        mon_str, day_str, year_str = m_us_text.group(1), m_us_text.group(2), m_us_text.group(3)
        mon_num = MONTH_NAMES.get(mon_str.lower().rstrip("."))
        if mon_num:
            year_num = int(year_str)
            if year_num < 100:
                year_num += 2000
            dt = _safe_date(year_num, mon_num, int(day_str))
            if dt:
                return [(dt, False)]

    # 4. Numeric formats: DD/MM/YYYY or MM/DD/YYYY
    m_num = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$", raw)
    if m_num:
        p1, p2, yr_str = int(m_num.group(1)), int(m_num.group(2)), m_num.group(3)
        yr = int(yr_str)
        if yr < 100:
            yr += 2000

        # Case A: p1 > 12 -> must be day-first (DD/MM/YYYY)
        if p1 > 12 and p2 <= 12:
            dt = _safe_date(yr, p2, p1)
            if dt:
                return [(dt, False)]

        # Case B: p2 > 12 -> must be month-first (MM/DD/YYYY)
        if p2 > 12 and p1 <= 12:
            dt = _safe_date(yr, p1, p2)
            if dt:
                return [(dt, False)]

        # Case C: Both <= 12 -> Ambiguous between day-first and month-first!
        # Per blueprint: Default to day-first, but flag ambiguity if p1 != p2
        if p1 <= 12 and p2 <= 12:
            dt_day_first = _safe_date(yr, p2, p1)
            dt_mon_first = _safe_date(yr, p1, p2)
            if dt_day_first and dt_mon_first:
                if p1 == p2:  # e.g. 05/05/2026
                    return [(dt_day_first, False)]
                return [
                    (dt_day_first, True),
                    (dt_mon_first, True),
                ]

    return []


# Regex to scan lines for potential dates
DATE_TOKEN_REGEX = re.compile(
    r"""
    (
        \b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b                                       # YYYY-MM-DD
        |
        \b\d{1,2}[\s\-/.][a-zA-Z]{3,9}(?:,\s*|[\s\-/.],?\s*)\d{2,4}\b           # DD Mon YYYY
        |
        \b[a-zA-Z]{3,9}\.?[\s\-/.],?\s*\d{1,2}(?:,\s*|[\s\-/.],?\s*)\d{2,4}\b   # Mon DD, YYYY
        |
        \b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b                                     # DD/MM/YYYY
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)


def detect_report_date(text: str) -> DateDetectionResult:
    """Find and rank all report dates in the extracted text.

    Scans text line-by-line, identifies contextual label keywords,
    ranks by medical relevance (Collection > Received > Reported > Print),
    and highlights ambiguities.
    """
    candidates: List[DateCandidate] = []
    seen_dates_by_priority = set()

    lines = [l.strip() for l in text.splitlines() if l.strip()]

    for line in lines:
        # Check if line matches any labeled category
        matched_priority = PRIORITY_UNLABELED
        matched_label_type = "unlabeled"

        for priority, label_type, label_regex in LABEL_PRIORITIES:
            m_label = label_regex.search(line)
            if m_label:
                matched_priority = priority
                matched_label_type = label_type
                break

        # Search for date occurrences in the line
        for match in DATE_TOKEN_REGEX.finditer(line):
            date_raw = match.group(0)
            parsed_list = _parse_date_string(date_raw)

            for dt, is_numeric_ambiguous in parsed_list:
                iso_str = dt.isoformat()
                key = (iso_str, matched_priority)

                if key not in seen_dates_by_priority:
                    seen_dates_by_priority.add(key)
                    conf = (
                        "high"
                        if matched_priority == PRIORITY_COLLECTION and not is_numeric_ambiguous
                        else "medium"
                        if matched_priority <= PRIORITY_REPORTED
                        else "low"
                    )

                    candidates.append(
                        DateCandidate(
                            date_iso=iso_str,
                            source_text=line[:120],  # capture line snippet
                            label_type=matched_label_type,
                            priority=matched_priority,
                            confidence=conf,
                            is_ambiguous_numeric=is_numeric_ambiguous,
                        )
                    )

    if not candidates:
        return DateDetectionResult(
            detected_date=None,
            source_text=None,
            is_ambiguous=False,
            alternatives=[],
            confidence="none",
        )

    # Sort candidates by medical priority (lowest number = highest priority).
    # Python sort is stable, preserving day-first ordering for ambiguous dates.
    candidates.sort(key=lambda c: c.priority)

    best_priority = candidates[0].priority
    best_candidates = [c for c in candidates if c.priority == best_priority]
    distinct_best_dates = list({c.date_iso for c in best_candidates})

    # Check for ambiguity:
    # 1. Multiple different dates at the same highest priority tier (e.g. 2 different collection dates)
    # 2. Or the best candidate has day/month numeric ambiguity
    is_ambiguous = len(distinct_best_dates) > 1 or candidates[0].is_ambiguous_numeric

    # Preferred date
    chosen = candidates[0]

    # Return distinct alternative dates for review
    unique_alts: List[DateCandidate] = []
    seen_iso = set()
    for c in candidates:
        if c.date_iso not in seen_iso:
            seen_iso.add(c.date_iso)
            unique_alts.append(c)

    return DateDetectionResult(
        detected_date=chosen.date_iso,
        source_text=chosen.source_text,
        is_ambiguous=is_ambiguous,
        alternatives=unique_alts,
        confidence=chosen.confidence if not is_ambiguous else "medium",
    )
