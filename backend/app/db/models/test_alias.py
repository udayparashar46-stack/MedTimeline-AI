"""TestAlias ORM model — mapping from variant/extracted raw test names to canonical tests.

Follows blueprint Section 7 & Section 9:
- test_id: FK to tests.id
- alias_normalized: normalized string (lowercase, stripped punctuation, collapsed spaces)
- raw_alias: original variant name as printed on lab reports (e.g. "Hb", "Haemoglobin", "Total Bili")
- source: 'seed' | 'user'
- patient_id: nullable FK to patients.id; null = global seed/mapping, non-null = workspace-specific mapping
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TestAlias(Base):
    __tablename__ = "test_aliases"
    __test__ = False  # Prevent pytest from attempting to collect ORM model as test suite

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    test_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias_normalized: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    raw_alias: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="seed"
    )  # 'seed' | 'user'
    patient_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=True, index=True
    )  # null = global

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    test = relationship("Test", back_populates="aliases")
