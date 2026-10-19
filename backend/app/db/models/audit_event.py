"""AuditEvent ORM model (Milestone 12 / Section 7).

As mandated by Section 7 and Section 10.1 of docs/PLAN.md:
- Records lifecycle audit events: workspace changes, uploads, date confirmations, reviews, exports.
- STRICT PRIVACY RULE: No medical values or patient clinical data are ever stored in this table.
  Only non-clinical metadata (event type, entity IDs, timestamps, counts) is recorded.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(60), nullable=False, index=True
    )
    entity_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    details: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
