"""Base abstractions for the Universal Document Reading Engine."""

from dataclasses import dataclass, field
from typing import List, Optional, Any
from app.services.extraction.parsers.layout_models import VisualLine, WordBox


@dataclass
class ExtractedTable:
    """A detected table structure with rows and column cells."""
    page_number: int
    headers: List[str] = field(default_factory=list)
    rows: List[List[str]] = field(default_factory=list)


@dataclass
class DocumentPage:
    """A single page of a parsed document."""
    page_number: int
    text: str
    visual_lines: List[VisualLine] = field(default_factory=list)
    tables: List[ExtractedTable] = field(default_factory=list)
    is_scanned: bool = False
    has_text_layer: bool = True
    char_count: int = 0


@dataclass
class DocumentContent:
    """Unified representation of an extracted laboratory document across all formats."""
    format: str  # "pdf" | "image" | "docx"
    page_count: int
    pages: List[DocumentPage] = field(default_factory=list)
    full_text: str = ""
    is_scanned: bool = False
    has_text_layer: bool = True
    total_characters: int = 0
    renderable_pdf_bytes: Optional[bytes] = None
    warning_message: Optional[str] = None

    def get_all_visual_lines(self) -> List[VisualLine]:
        """Aggregate visual lines from all pages."""
        lines = []
        for p in self.pages:
            lines.extend(p.visual_lines)
        return lines


class AbstractDocumentReader:
    """Interface that every document reader must implement."""

    def can_read(self, format_key: str) -> bool:
        raise NotImplementedError

    def read(self, content: bytes, original_filename: str = "") -> DocumentContent:
        raise NotImplementedError
