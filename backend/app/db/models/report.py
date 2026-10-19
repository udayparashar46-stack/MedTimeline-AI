"""Report ORM model — represents an uploaded lab report PDF.

Follows blueprint Section 7:
- Linked to a Patient workspace by patient_id foreign key.
- Stores original filename for display and file_path (storage key) for disk location.
- SHA-256 hash ensures duplicate detection.
- Tracks page_count, file_size_bytes, and status (queued, processing, needs_review, reviewed, failed).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)  # storage key e.g. <uuid>.pdf
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="queued"
    )  # queued | processing | needs_review | reviewed | failed
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_text_layer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lab_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    report_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    report_date_source_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    report_date_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_date_ambiguous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    date_alternatives: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded candidate list
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # Raw text for debugging view
    extraction_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    extracted_results = relationship(
        "ExtractedResult", back_populates="report", cascade="all, delete-orphan"
    )

