"""ExtractedResult ORM model — represents an individual lab test row parsed from a PDF.

Follows blueprint Section 7 & Section 11:
- Linked to Report by report_id foreign key (cascades on delete).
- Stores raw exact strings: raw_test_name, raw_value_text, raw_unit, raw_reference_text, printed_flag.
- Preserves source line snippet and bounding box coordinates for evidence linking.
- Deterministic parse_confidence: 'high' | 'medium' | 'low'.
- Review status: 'unreviewed' | 'confirmed' | 'edited' | 'rejected' | 'manual'.
- Computes derived numeric and comparator properties on read without altering raw strings.
"""

import uuid
from datetime import datetime, timezone
import json
import re

from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExtractedResult(Base):
    __tablename__ = "extracted_results"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    report_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    row_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    section_heading: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Raw extracted values (never mutated)
    raw_test_name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_value_text: Mapped[str] = mapped_column(String(100), nullable=False)
    raw_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    raw_reference_text: Mapped[str | None] = mapped_column(String(100), nullable=True)
    printed_flag: Mapped[str | None] = mapped_column(String(20), nullable=True)  # H, L, HIGH, LOW, *
    source_snippet: Mapped[str] = mapped_column(Text, nullable=False)
    bbox: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded [x0, y0, x1, y1]

    # Parsing metadata
    parse_confidence: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )  # high | medium | low
    test_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tests.id", ondelete="SET NULL"), nullable=True, index=True
    )  # M7 canonical test FK

    # Review workflow
    review_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unreviewed"
    )  # unreviewed | confirmed | edited | rejected | manual
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationship back to report
    report = relationship("Report", back_populates="extracted_results")

    # Relationship to canonical test
    test = relationship("Test", back_populates="results")

    # Relationship to audit log edits
    edits = relationship(
        "ResultEdit",
        back_populates="result",
        cascade="all, delete-orphan",
        order_by="ResultEdit.created_at.asc()",
    )

    def get_effective_value(self, field_name: str) -> str | None:
        """Return the latest edited value for a field, or fallback to the raw column."""
        if self.edits:
            for edit in reversed(self.edits):
                if edit.field == field_name:
                    return edit.new_value
        return getattr(self, field_name, None)

    @property
    def effective_test_name(self) -> str:
        return self.get_effective_value("raw_test_name") or self.raw_test_name

    @property
    def effective_value_text(self) -> str:
        return self.get_effective_value("raw_value_text") or self.raw_value_text

    @property
    def effective_unit(self) -> str | None:
        return self.get_effective_value("raw_unit")

    @property
    def effective_reference_text(self) -> str | None:
        return self.get_effective_value("raw_reference_text")

    @property
    def effective_printed_flag(self) -> str | None:
        return self.get_effective_value("printed_flag")

    @property
    def derived_value_numeric(self) -> float | None:
        """Derive numeric value from effective_value_text, stripping comparators."""
        val = self.effective_value_text
        if not val:
            return None
        cleaned = re.sub(r"^[<>]=?\s*", "", val.strip())
        # Strip trailing flag if attached e.g. '13.2 H'
        cleaned = re.sub(r"\s+[A-Za-z*]+$", "", cleaned)
        try:
            return float(cleaned)
        except ValueError:
            return None

    @property
    def derived_comparator(self) -> str | None:
        """Extract comparator (<, >, <=, >=) if present in effective_value_text."""
        val = self.effective_value_text
        if not val:
            return None
        m = re.match(r"^([<>]=?)\s*", val.strip())
        return m.group(1) if m else None

    @property
    def derived_ref_range(self) -> tuple[float | None, float | None]:
        """Derive (ref_low, ref_high) from effective_reference_text."""
        ref_text = self.effective_reference_text
        if not ref_text:
            return None, None
        txt = ref_text.strip()
        # Range e.g. 13.0 - 17.0 or -2.0 - 2.0 or 70 - 110
        range_match = re.search(r"(-?\d+(?:\.\d+)?)\s*[-–—to]\s*(-?\d+(?:\.\d+)?)", txt, re.IGNORECASE)
        if range_match:
            try:
                return float(range_match.group(1)), float(range_match.group(2))
            except ValueError:
                pass
        # Upper bound e.g. < 200 or Up to 150
        upper_match = re.search(r"(?:<|<=|up\s*to\s*less\s*than)\s*(-?\d+(?:\.\d+)?)", txt, re.IGNORECASE)
        if upper_match:
            try:
                return None, float(upper_match.group(1))
            except ValueError:
                pass
        # Lower bound e.g. > 50 or >= 40
        lower_match = re.search(r"(?:>|>=|greater\s*than)\s*(-?\d+(?:\.\d+)?)", txt, re.IGNORECASE)
        if lower_match:
            try:
                return float(lower_match.group(1)), None
            except ValueError:
                pass
        return None, None

