"""Data models for text layout reconstruction and row extraction."""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class WordBox:
    """Word bounding box from PyMuPDF."""
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    block_no: int
    line_no: int
    word_no: int


@dataclass
class VisualLine:
    """A reconstructed horizontal visual line on a PDF page."""
    words: List[WordBox]
    text: str
    page_number: int
    y0: float
    y1: float
    x0: float
    x1: float


@dataclass
class ParsedRowCandidate:
    """A parsed lab test result row before persistence."""
    page_number: int
    row_order: int
    section_heading: Optional[str]
    raw_test_name: str
    raw_value_text: str
    raw_unit: Optional[str]
    raw_reference_text: Optional[str]
    printed_flag: Optional[str]
    source_snippet: str
    bbox: Optional[List[float]]  # [x0, y0, x1, y1]
    parse_confidence: str  # "high" | "medium" | "low"


@dataclass
class SkippedLine:
    """A line deemed non-result (header, footer, metadata, or unparseable)."""
    page_number: int
    text: str
    reason: str  # e.g. "page_metadata", "table_header", "footer", "unparseable_text"


@dataclass
class LayoutStrategyResult:
    """Result of running a layout parsing strategy on a document."""
    strategy_name: str
    rows: List[ParsedRowCandidate]
    skipped_lines: List[SkippedLine]
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0

    @property
    def total_rows(self) -> int:
        return len(self.rows)

    @property
    def score(self) -> float:
        """Composite score to determine winning strategy: prefers high/medium confidence rows."""
        return (self.high_count * 3.0) + (self.medium_count * 2.0) + (self.low_count * 0.5)
