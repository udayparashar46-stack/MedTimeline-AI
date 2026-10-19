"""Patient repository — all DB operations for the Patient model.

The repository pattern keeps SQL queries in one place so routers stay thin
and the logic is easy to test in isolation.
"""

from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientUpdate


def get_patient(db: Session, patient_id: str) -> Patient | None:
    """Return a patient by ID, or None if not found / soft-deleted."""
    return db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.is_deleted == False)
    ).scalar_one_or_none()


def list_patients(
    db: Session,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Patient], int]:
    """Return a filtered, paginated list and the total count."""
    base_query = select(Patient).where(Patient.is_deleted == False)

    if search:
        term = f"%{search.lower()}%"
        base_query = base_query.where(
            func.lower(Patient.display_name).like(term)
        )

    total_query = select(func.count()).select_from(base_query.subquery())
    total: int = db.execute(total_query).scalar_one()

    patients = db.execute(
        base_query.order_by(Patient.created_at.desc()).offset(skip).limit(limit)
    ).scalars().all()

    return list(patients), total


def create_patient(db: Session, data: PatientCreate) -> Patient:
    """Insert a new patient row and return it."""
    patient = Patient(
        display_name=data.display_name,
        date_of_birth=data.date_of_birth,
        sex=data.sex,
        notes=data.notes,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def update_patient(db: Session, patient: Patient, data: PatientUpdate) -> Patient:
    """Apply partial updates (only non-None fields) and return the updated patient."""
    updates = data.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


def delete_patient(db: Session, patient: Patient) -> None:
    """Soft-delete patient and cascade delete all associated reports and disk files."""
    from app.repositories import report_repo
    from app.services.storage import storage_service

    reports = report_repo.get_all_reports_for_patient(db, patient.id)
    for r in reports:
        storage_service.delete_file(r.file_path)
        r.is_deleted = True

    patient.is_deleted = True
    db.commit()

