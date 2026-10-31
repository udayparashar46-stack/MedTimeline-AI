"""Pure, deterministic value, reference range, unit, and flag parsers.

Guiding principles (Section 1.2 & 9.1):
- Preserve original text exactly in raw fields.
- Parse derived fields separately without guessing or inventing data.
- Support comparators (<, >, <=, >=), decimals, ranges, qualitative text values,
  and trailing/inline flags.
"""

import re
from typing import Optional, Tuple

# Common clinical test units
COMMON_UNITS = {
    # Concentration
    "g/dl", "g/l", "mg/dl", "mg/l", "ug/dl", "ug/l", "mcg/dl", "mcg/l", "ng/dl", "ng/ml",
    "pg/ml", "pg/dl", "pmol/l", "nmol/l", "umol/l", "mmol/l", "meq/l", "u/l", "iu/l", "mu/l",
    "uiu/ml", "miu/ml", "ku/l",
    # Hematology & Counts
    "cells/mcl", "cells/ul", "/cumm", "/ul", "/hpf", "/lpf", "10^3/ul", "10^6/ul", "10^9/l",
    "10^12/l", "x10^3/ul", "x10^6/ul", "x10^9/l", "x10^12/l", "thou/ul", "mil/ul", "/mcl",
    # RBC indices & sizes
    "fl", "pg", "%", "percent",
    # Rates and Time
    "mm/hr", "mm/1st hr", "sec", "secs", "seconds", "min", "minutes",
    # Ratios and Densities
    "ratio", "index", "g/g", "mg/g", "ug/mg",
}

# Common OCR unit character substitutions where slashes or glyphs are misread
OCR_UNIT_ALIASES = {
    "mgidl": "mg/dL",
    "mg/dl": "mg/dL",
    "gidl": "g/dL",
    "g/dl": "g/dL",
    "gil": "g/dL",
    "ulm": "uIU/mL",
    "uiuml": "uIU/mL",
    "uiu/ml": "uIU/mL",
    "mmolll": "mmol/L",
    "mmol/l": "mmol/L",
}

# Known qualitative clinical text results
QUALITATIVE_VALUES = {
    "negative", "positive", "reactive", "non-reactive", "nonreactive", "nil", "normal",
    "not detected", "detected", "trace", "present", "absent", "clear", "cloudy", "turbid",
    "straw", "yellow", "amber", "pale yellow", "adequate", "borderline", "equivocal",
    "inconclusive", "seen", "not seen", "none", "unremarkable", "moderately reactive",
    "weakly reactive", "strongly reactive", "indeterminate",
}

# Abnormal flag tokens
FLAG_TOKENS = {
    "h", "l", "high", "low", "abnormal", "critical", "*", "a",
    "critically high", "critically low", "hh", "ll", "pos", "neg",
}

# Regex for numeric values with optional comparator and optional trailing flag
# Examples: "13.2", "-1.5", "< 0.05", ">100", ">= 1.5", "<= 20", "13.2 H", "140*", "-0.2 L"
NUMERIC_VALUE_REGEX = re.compile(
    r"^(?P<comp>[<>]=?)?\s*(?P<num>-?\d+(?:\.\d+)?)(?:\s*(?P<flag>[A-Za-z*]+))?$"
)

# Reference interval regexes
# e.g., "13.0 - 17.0", "-2.0 to 2.0", "70 - 110", "0.5 to 1.2", "< 200", "> 50", "Up to 150"
REF_RANGE_REGEX = re.compile(
    r"^(?P<low>-?\d+(?:\.\d+)?)\s*[-–—to]\s*(?P<high>-?\d+(?:\.\d+)?)$",
    re.IGNORECASE,
)
REF_UPPER_BOUND_REGEX = re.compile(
    r"^(?:<|<=|up\s*to|less\s*than)\s*(?P<val>-?\d+(?:\.\d+)?)$",
    re.IGNORECASE,
)
REF_LOWER_BOUND_REGEX = re.compile(
    r"^(?:>|>=|greater\s*than)\s*(?P<val>-?\d+(?:\.\d+)?)$",
    re.IGNORECASE,
)


def is_known_unit(token: str) -> bool:
    """Check if token matches or contains a standard lab unit."""
    cleaned = token.strip().strip(":,()[]").lower()
    if cleaned in COMMON_UNITS or cleaned in OCR_UNIT_ALIASES:
        return True
    # Strip parentheses e.g. (mg/dL)
    stripped = re.sub(r"^[\(\[]|[\)\]]$", "", cleaned)
    return stripped in COMMON_UNITS or stripped in OCR_UNIT_ALIASES


def is_abnormal_flag(token: str) -> bool:
    """Check if token is a standard abnormal indicator (H, L, HIGH, LOW, *)."""
    cleaned = token.strip().lower()
    return cleaned in FLAG_TOKENS


def is_qualitative_value(token: str) -> bool:
    """Check if token is a recognizable qualitative result string."""
    cleaned = token.strip().lower()
    return cleaned in QUALITATIVE_VALUES


def parse_value_token(raw_text: str) -> Tuple[bool, Optional[str], Optional[float], Optional[str], Optional[str]]:
    """Parse a value token into its components.
    
    Returns:
        (is_valid, raw_value_text, numeric_value, comparator, flag)
    """
    token = raw_text.strip()
    if not token:
        return False, None, None, None, None

    # 1. Qualitative value (e.g. 'Negative', 'Positive', 'Trace')
    if is_qualitative_value(token):
        return True, token, None, None, None

    # 2. Value with comparator and/or attached flag (e.g. '< 0.05', '13.2 H', '140*')
    m = NUMERIC_VALUE_REGEX.match(token)
    if m:
        comp = m.group("comp")
        num_str = m.group("num")
        flag = m.group("flag")

        # Check if the flag is a valid flag
        flag_val = None
        if flag and is_abnormal_flag(flag):
            flag_val = flag.upper()
            raw_val = f"{comp or ''}{num_str}".strip()
        else:
            raw_val = token

        try:
            num = float(num_str)
        except ValueError:
            num = None

        return True, raw_val, num, comp, flag_val

    # 3. Numeric range as value (e.g. '1.2 - 3.4')
    if REF_RANGE_REGEX.match(token):
        return True, token, None, None, None

    return False, None, None, None, None


def parse_reference_interval(raw_text: str) -> Tuple[bool, Optional[float], Optional[float], Optional[str]]:
    """Parse a reference interval string into low, high, and comparator.
    
    Returns:
        (is_valid, ref_low, ref_high, comparator)
    """
    token = raw_text.strip()
    if not token:
        return False, None, None, None

    # Dual bound e.g. 13.0 - 17.0
    m_range = REF_RANGE_REGEX.match(token)
    if m_range:
        try:
            low = float(m_range.group("low"))
            high = float(m_range.group("high"))
            return True, low, high, None
        except ValueError:
            pass

    # Upper bound e.g. < 200 or Up to 150
    m_upper = REF_UPPER_BOUND_REGEX.match(token)
    if m_upper:
        try:
            val = float(m_upper.group("val"))
            return True, None, val, "<"
        except ValueError:
            pass

    # Lower bound e.g. > 50
    m_lower = REF_LOWER_BOUND_REGEX.match(token)
    if m_lower:
        try:
            val = float(m_lower.group("val"))
            return True, val, None, ">"
        except ValueError:
            pass

    # Qualitative normal (e.g. Negative)
    if is_qualitative_value(token):
        return True, None, None, None

    return False, None, None, None
