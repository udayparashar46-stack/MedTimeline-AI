"""Test ORM model — canonical clinical test definition.

Follows blueprint Section 7:
- canonical_name: e.g. "Hemoglobin", "Total Cholesterol", "Serum Creatinine"
- category: e.g. "Complete Blood Count", "Lipid Profile", "Liver Function"
- preferred_unit: standard measurement unit (e.g. "g/dL", "mg/dL", "mmol/L")
- is_seeded: True for built-in seed catalog, False for user-created tests
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Test(Base):
    __tablename__ = "tests"
    __test__ = False  # Prevent pytest from attempting to collect ORM model as test suite

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    canonical_name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    preferred_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_seeded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    aliases = relationship(
        "TestAlias",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="TestAlias.raw_alias.asc()",
    )
    results = relationship(
        "ExtractedResult",
        back_populates="test",
    )
