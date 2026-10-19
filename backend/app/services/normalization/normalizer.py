"""Test name normalizer.

Follows blueprint Section 9.1 & 9.3:
- Lowercase
- Remove punctuation and symbols
- Collapse multiple whitespace
- Strips method noise suffixes only via explicit deterministic rules
- NEVER strips crucial clinical specifiers ("total", "direct", "indirect", "free", "ratio")
"""

import re


def normalize_test_name(raw_name: str) -> str:
    """Normalize a raw lab test name to a canonical comparison key.
    
    Examples:
      "Hemoglobin" -> "hemoglobin"
      "Hb (Hemoglobin)" -> "hb hemoglobin"
      "Total WBC Count" -> "total wbc count"
      "Bilirubin - Total" -> "bilirubin total"
      "Bilirubin (Direct)" -> "bilirubin direct"
    """
    if not raw_name:
        return ""

    # Convert to lowercase
    normalized = raw_name.lower().strip()

    # Replace punctuation, brackets, hyphens, and slashes with spaces
    normalized = re.sub(r"[\-_/\\,;:()[\]{}*+?!@#$^&~`|\"']", " ", normalized)

    # Collapse multiple whitespaces
    normalized = re.sub(r"\s+", " ", normalized).strip()

    return normalized
