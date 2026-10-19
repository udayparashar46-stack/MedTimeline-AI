"""ResultEdit ORM model — audit log overlay for user corrections.

Follows blueprint Section 7 & Section 11:
- Linked to ExtractedResult by result_id foreign key (cascades on delete).
- Records field name, old value, new value, actor ('user'), and timestamp.
- Ensures original raw columns in ExtractedResult are NEVER mutated or overwritten.
- Effective value = latest edit on that field, else the raw value.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ResultEdit(Base):
    __tablename__ = "result_edits"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    result_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("extracted_results.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # raw_test_name, raw_value_text, raw_unit, raw_reference_text, printed_flag, review_status
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_by: Mapped[str | None] = mapped_column(String(100), default="user", nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    # Relationship back to extracted result
    result = relationship("ExtractedResult", back_populates="edits")
