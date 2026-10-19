"""Patients router — CRUD endpoints for patient workspaces.

Routes follow the blueprint Section 8 API table:
  GET  /patients          — list workspaces (with optional search, scoped to current user)
  POST /patients          — create a workspace (owned by current user)
  GET  /patients/{id}     — get one workspace (enforces workspace tenant isolation)
  PATCH /patients/{id}    — rename / update notes
  DELETE /patients/{id}   — soft-delete with typed confirmation
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.user import User
from app.repositories import patient_repo, audit_repo
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse, PatientListResponse
from app.api.deps import get_current_user, verify_patient_access

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=PatientListResponse)
def list_patients(
    search: str | None = Query(None, description="Filter by name (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PatientListResponse:
    """List all patient workspaces owned by the authenticated user, optionally filtered by name."""
    owner_filter = None if current_user.is_superuser else current_user.id
    patients, total = patient_repo.list_patients(
        db, search=search, skip=skip, limit=limit, owner_id=owner_filter
    )
    return PatientListResponse(
        items=[PatientResponse.model_validate(p) for p in patients],
        total=total,
    )


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    data: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PatientResponse:
    """Create a new patient workspace associated with the authenticated user."""
    patient = patient_repo.create_patient(db, data, owner_id=current_user.id)
    audit_repo.log_audit_event(
        db,
        event_type="patient_created",
        patient_id=patient.id,
        details=f"display_name={patient.display_name}",
    )
    return PatientResponse.model_validate(patient)


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PatientResponse:
    """Retrieve a single patient workspace by ID with strict tenant isolation."""
    patient = verify_patient_access(patient_id, db=db, current_user=current_user)
    return PatientResponse.model_validate(patient)


@router.patch("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    data: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PatientResponse:
    """Partially update a patient workspace (rename, update notes)."""
    patient = verify_patient_access(patient_id, db=db, current_user=current_user)
    updated = patient_repo.update_patient(db, patient, data)
    audit_repo.log_audit_event(
        db,
        event_type="patient_updated",
        patient_id=patient.id,
        details="fields updated",
    )
    return PatientResponse.model_validate(updated)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Soft-delete a patient workspace. The UI must confirm before calling this."""
    patient = verify_patient_access(patient_id, db=db, current_user=current_user)
    patient_repo.delete_patient(db, patient)
    audit_repo.log_audit_event(
        db,
        event_type="patient_deleted",
        patient_id=patient.id,
        details=f"deleted patient {patient.display_name}",
    )
    return None
