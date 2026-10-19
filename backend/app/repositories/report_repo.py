"""Report repository — DB queries for Report model.

Handles report lookup, duplicate SHA-256 checks per patient, listing,
creation, extraction updates, and deletion.
"""

from typing import Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.models.report import Report


def get_report(db: Session, report_id: str) -> Report | None:
    """Return an active report by ID, or None if missing or soft-deleted."""
    return db.execute(
        select(Report).where(Report.id == report_id, Report.is_deleted == False)
    ).scalar_one_or_none()


def get_report_by_sha256(
    db: Session, patient_id: str, file_sha256: str
) -> Report | None:
    """Check if a report with this SHA-256 already exists for this patient."""
    return db.execute(
        select(Report).where(
            Report.patient_id == patient_id,
            Report.file_sha256 == file_sha256,
            Report.is_deleted == False,
        )
    ).scalar_one_or_none()


def list_reports_for_patient(
    db: Session, patient_id: str
) -> tuple[list[Report], int]:
    """Return all active reports for a patient ordered by creation date descending."""
    base_query = select(Report).where(
        Report.patient_id == patient_id, Report.is_deleted == False
    )

    total_query = select(func.count()).select_from(base_query.subquery())
    total: int = db.execute(total_query).scalar_one()

    reports = (
        db.execute(base_query.order_by(Report.created_at.desc())).scalars().all()
    )
    return list(reports), total


def create_report(
    db: Session,
    patient_id: str,
    original_filename: str,
    file_path: str,
    file_sha256: str,
    file_size_bytes: int,
    page_count: int,
    status: str = "needs_review",
    failure_reason: Optional[str] = None,
    has_text_layer: bool = False,
    report_date: Optional[str] = None,
    report_date_source_text: Optional[str] = None,
    is_date_ambiguous: bool = False,
    date_alternatives: Optional[str] = None,
    extracted_text: Optional[str] = None,
    extraction_version: Optional[str] = None,
) -> Report:
    """Create and persist a new Report record with M4 extraction attributes."""
    report = Report(
        patient_id=patient_id,
        original_filename=original_filename,
        file_path=file_path,
        file_sha256=file_sha256,
        file_size_bytes=file_size_bytes,
        page_count=page_count,
        status=status,
        failure_reason=failure_reason,
        has_text_layer=has_text_layer,
        report_date=report_date,
        report_date_source_text=report_date_source_text,
        is_date_ambiguous=is_date_ambiguous,
        date_alternatives=date_alternatives,
        extracted_text=extracted_text,
        extraction_version=extraction_version,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def update_report(
    db: Session,
    report: Report,
    updates: dict[str, Any],
) -> Report:
    """Update fields on a report (e.g. confirming date, editing lab name)."""
    for key, value in updates.items():
        if hasattr(report, key) and value is not None:
            setattr(report, key, value)
    db.commit()
    db.refresh(report)
    return report


def delete_report(db: Session, report: Report) -> None:
    """Soft-delete a report row."""
    report.is_deleted = True
    db.commit()


def get_all_reports_for_patient(db: Session, patient_id: str) -> list[Report]:
    """Return all reports for a patient (including already soft-deleted) for cascade cleanup."""
    return list(
        db.execute(select(Report).where(Report.patient_id == patient_id))
        .scalars()
        .all()
    )
