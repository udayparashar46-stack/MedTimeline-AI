"""Audit repository for MedTimeline AI (Milestone 12).

Logs and queries non-clinical audit events:
- Lifecycle actions: patient created/deleted, report uploaded/deleted, date confirmed,
  edits made, CSV/PDF exported, system reset.
- Zero clinical or laboratory values are logged in this repository.
"""

from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import select, func, desc
from app.db.models.audit_event import AuditEvent


def log_audit_event(
    db: Session,
    event_type: str,
    patient_id: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[str] = None,
) -> AuditEvent:
    """Record an immutable lifecycle audit event (non-clinical metadata only)."""
    event = AuditEvent(
        patient_id=patient_id,
        event_type=event_type,
        entity_id=entity_id,
        details=details,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_audit_events(
    db: Session,
    patient_id: Optional[str] = None,
    event_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[AuditEvent], int]:
    """Return paginated audit events, newest first."""
    base_query = select(AuditEvent)

    if patient_id:
        base_query = base_query.where(AuditEvent.patient_id == patient_id)
    if event_type:
        base_query = base_query.where(AuditEvent.event_type == event_type)

    total_query = select(func.count()).select_from(base_query.subquery())
    total: int = db.execute(total_query).scalar_one()

    events = db.execute(
        base_query.order_by(desc(AuditEvent.created_at)).offset(skip).limit(limit)
    ).scalars().all()

    return list(events), total
