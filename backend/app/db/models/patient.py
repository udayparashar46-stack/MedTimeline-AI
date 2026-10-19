"""Patient ORM model — one record per patient workspace.

Stores only non-clinical metadata: a display label, optional date of birth
and sex, and free-form notes. Real report data lives in Report rows (M3+).
owner_id is nullable now; it will hold a user ID once auth is added (M12+).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)  # ISO date string YYYY-MM-DD
    sex: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # future auth
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
