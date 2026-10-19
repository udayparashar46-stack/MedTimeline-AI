"""Audit Events API router (Milestone 12).

Provides audit visibility into workspace lifecycle actions without exposing clinical values.
Endpoints:
- GET /api/v1/audit-events: List audit events, optionally filtered by patient_id or event_type.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories import audit_repo
from app.schemas.audit import AuditEventListResponse, AuditEventResponse

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("", response_model=AuditEventListResponse)
def list_audit_events(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> AuditEventListResponse:
    """Retrieve paginated audit trail events (strictly non-clinical metadata)."""
    events, total = audit_repo.list_audit_events(
        db, patient_id=patient_id, event_type=event_type, skip=skip, limit=limit
    )
    return AuditEventListResponse(
        items=[AuditEventResponse.model_validate(e) for e in events],
        total=total,
    )
