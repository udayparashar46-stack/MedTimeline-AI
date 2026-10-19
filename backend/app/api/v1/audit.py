"""Audit Events API router (Milestone 12).

Provides audit visibility into workspace lifecycle actions without exposing clinical values.
Endpoints:
- GET /api/v1/audit-events: List audit events, optionally filtered by patient_id or event_type.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.db.models.user import User
from app.db.models.patient import Patient
from app.repositories import audit_repo
from app.schemas.audit import AuditEventListResponse, AuditEventResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("", response_model=AuditEventListResponse)
def list_audit_events(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuditEventListResponse:
    """Retrieve paginated audit trail events (strictly non-clinical metadata) with authorization."""
    if patient_id:
        # Allow viewing audit events for deleted patients too — fetch including is_deleted=True
        patient = db.execute(
            select(Patient).where(Patient.id == patient_id)
        ).scalar_one_or_none()
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient workspace not found.",
            )
        # Enforce tenant isolation
        if patient.owner_id and patient.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient workspace not found.",
            )

    events, total = audit_repo.list_audit_events(
        db, patient_id=patient_id, event_type=event_type, skip=skip, limit=limit
    )
    return AuditEventListResponse(
        items=[AuditEventResponse.model_validate(e) for e in events],
        total=total,
    )
