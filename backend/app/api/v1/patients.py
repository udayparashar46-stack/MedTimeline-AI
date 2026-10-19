"""Patients router — CRUD endpoints for patient workspaces.

Routes follow the blueprint Section 8 API table:
  GET  /patients          — list workspaces (with optional search)
  POST /patients          — create a workspace
  GET  /patients/{id}     — get one workspace
  PATCH /patients/{id}    — rename / update notes
  DELETE /patients/{id}   — soft-delete with typed confirmation
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories import patient_repo
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse, PatientListResponse

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=PatientListResponse)
def list_patients(
    search: str | None = Query(None, description="Filter by name (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PatientListResponse:
    """List all patient workspaces, optionally filtered by name."""
    patients, total = patient_repo.list_patients(db, search=search, skip=skip, limit=limit)
    return PatientListResponse(
        items=[PatientResponse.model_validate(p) for p in patients],
        total=total,
    )


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    data: PatientCreate,
    db: Session = Depends(get_db),
) -> PatientResponse:
    """Create a new patient workspace."""
    patient = patient_repo.create_patient(db, data)
    from app.repositories import audit_repo
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
) -> PatientResponse:
    """Retrieve a single patient workspace by ID."""
    patient = patient_repo.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return PatientResponse.model_validate(patient)


@router.patch("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    data: PatientUpdate,
    db: Session = Depends(get_db),
) -> PatientResponse:
    """Partially update a patient workspace (rename, update notes)."""
    patient = patient_repo.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    updated = patient_repo.update_patient(db, patient, data)
    from app.repositories import audit_repo
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
) -> None:
    """Soft-delete a patient workspace. The UI must confirm before calling this."""
    patient = patient_repo.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    patient_repo.delete_patient(db, patient)
    from app.repositories import audit_repo
    audit_repo.log_audit_event(
        db,
        event_type="patient_deleted",
        patient_id=patient.id,
        details=f"deleted patient {patient.display_name}",
    )
    return None

