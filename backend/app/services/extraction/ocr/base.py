"""Modular OCR engine interface and result abstractions."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional
from app.services.extraction.parsers.layout_models import VisualLine


@dataclass
class OCRPageResult:
    page_number: int
    text: str
    visual_lines: List[VisualLine] = field(default_factory=list)
    confidence: float = 0.0
    detected_orientation_angle: int = 0


@dataclass
class OCRResult:
    success: bool
    engine_name: str
    pages: List[OCRPageResult] = field(default_factory=list)
    full_text: str = ""
    total_characters: int = 0
    message: Optional[str] = None


class OCREngine(ABC):
    """Abstract base class for swappable OCR engines."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this engine's dependencies are installed and operational."""
        raise NotImplementedError

    @abstractmethod
    def extract_text_from_pdf(self, pdf_bytes: bytes) -> OCRResult:
        """Perform OCR on a multi-page PDF document."""
        raise NotImplementedError

    @abstractmethod
    def extract_text_from_image(self, image_bytes: bytes) -> OCRResult:
        """Perform OCR on an image (JPEG, PNG, TIFF)."""
        raise NotImplementedError
