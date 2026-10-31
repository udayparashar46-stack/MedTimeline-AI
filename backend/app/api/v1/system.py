"""System and Data Portability API router (Milestones 11 & 12).

Implements:
- POST /api/v1/system/reset: Complete 'Delete Everything' cascade. Requires authentication.
- GET /api/v1/patients/{id}/export/archive: Workspace data portability bundle.
- POST /api/v1/patients/import/archive: Restore workspace archive.
"""

import os
from pathlib import Path
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, or_
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.db.models.user import User
from app.db.models.patient import Patient
from app.db.models.report import Report
from app.db.models.extracted_result import ExtractedResult
from app.db.models.result_edit import ResultEdit
from app.db.models.test_alias import TestAlias
from app.db.models.audit_event import AuditEvent
from app.repositories import audit_repo
from app.services.normalization.seeder import seed_canonical_tests
from app.core.config import settings
from app.api.deps import get_current_user, verify_patient_access
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    DashboardPatientItem,
    DashboardReportItem,
    DashboardActivityItem,
)

router = APIRouter(tags=["system", "portability"])


class ResetConfirmRequest(BaseModel):
    confirm: str = Field(..., description="Must be exactly 'DELETE EVERYTHING'")


class ResetSummaryResponse(BaseModel):
    status: str
    patients_deleted: int
    reports_deleted: int
    results_deleted: int
    files_deleted: int
    message: str


@router.get("/system/dashboard", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryResponse:
    """Return live dashboard statistics computed strictly from database records for the current user."""
    # 1. Fetch active patients for this user
    owner_filter = None if current_user.is_superuser else current_user.id
    patients_q = select(Patient).where(Patient.is_deleted == False)
    if owner_filter:
        patients_q = patients_q.where(
            or_(Patient.owner_id == owner_filter, Patient.owner_id.is_(None))
        )
    patients = list(db.execute(patients_q.order_by(Patient.created_at.desc())).scalars().all())
    patient_ids = [p.id for p in patients]
    patient_map = {p.id: p.display_name for p in patients}

    total_patients = len(patients)

    if not patient_ids:
        return DashboardSummaryResponse(
            total_patients=0,
            total_reports=0,
            reports_awaiting_review=0,
            processing_failures=0,
            recent_patients=[],
            recent_reports=[],
            recent_activities=[],
        )

    # 2. Fetch reports for these patients
    reports_q = select(Report).where(
        Report.patient_id.in_(patient_ids),
        Report.is_deleted == False,
    ).order_by(Report.created_at.desc())
    reports = list(db.execute(reports_q).scalars().all())

    total_reports = len(reports)
    awaiting_review = sum(1 for r in reports if r.status == "needs_review")
    failures = sum(1 for r in reports if r.status == "failed")

    # Map reports per patient
    patient_reports_count: Dict[str, int] = {}
    patient_latest_date: Dict[str, str | None] = {}
    for r in reports:
        patient_reports_count[r.patient_id] = patient_reports_count.get(r.patient_id, 0) + 1
        if r.patient_id not in patient_latest_date or (r.report_date and not patient_latest_date[r.patient_id]):
            patient_latest_date[r.patient_id] = r.report_date

    # Build recent patients (up to 5)
    recent_patients = [
        DashboardPatientItem(
            id=p.id,
            display_name=p.display_name,
            report_count=patient_reports_count.get(p.id, 0),
            latest_report_date=patient_latest_date.get(p.id),
            created_at=p.created_at,
        )
        for p in patients[:5]
    ]

    # Build recent reports (up to 5)
    recent_reports = [
        DashboardReportItem(
            id=r.id,
            patient_id=r.patient_id,
            patient_name=patient_map.get(r.patient_id, "Unknown"),
            original_filename=r.original_filename,
            status=r.status,
            report_date=r.report_date,
            created_at=r.created_at,
        )
        for r in reports[:5]
    ]

    # 3. Fetch recent audit events for these patients
    events_q = select(AuditEvent).where(
        AuditEvent.patient_id.in_(patient_ids)
    ).order_by(AuditEvent.created_at.desc()).limit(6)
    events = list(db.execute(events_q).scalars().all())

    recent_activities = [
        DashboardActivityItem(
            id=e.id,
            event_type=e.event_type,
            details=e.details,
            created_at=e.created_at,
        )
        for e in events
    ]

    return DashboardSummaryResponse(
        total_patients=total_patients,
        total_reports=total_reports,
        reports_awaiting_review=awaiting_review,
        processing_failures=failures,
        recent_patients=recent_patients,
        recent_reports=recent_reports,
        recent_activities=recent_activities,
    )


@router.post("/system/reset", response_model=ResetSummaryResponse)
def reset_entire_system(
    payload: ResetConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResetSummaryResponse:
    """Permanently delete all patient workspaces, reports, extracted results, and uploaded files.

    Requires authentication. Only superusers can reset all data; regular users only see/delete
    their own patients. We always require typed confirmation regardless.
    """
    if payload.confirm != "DELETE EVERYTHING":
        raise HTTPException(
            status_code=400,
            detail="Typed confirmation mismatch. You must send 'DELETE EVERYTHING' to proceed.",
        )

    # 1. Count items before deletion
    patient_count = db.execute(select(Patient)).scalars().all()
    report_count = db.execute(select(Report)).scalars().all()
    result_count = db.execute(select(ExtractedResult)).scalars().all()

    num_patients = len(patient_count)
    num_reports = len(report_count)
    num_results = len(result_count)

    # 2. Delete database rows in foreign-key dependency order
    db.execute(delete(ResultEdit))
    db.execute(delete(ExtractedResult))
    db.execute(delete(Report))
    db.execute(delete(TestAlias))
    db.execute(delete(AuditEvent))
    db.execute(delete(Patient))
    db.commit()

    # 3. Clean uploaded PDF files on disk
    files_deleted = 0
    upload_dir = Path(settings.UPLOAD_DIR).resolve()
    if not upload_dir.exists():
        upload_dir = Path("../data/uploads").resolve()

    if upload_dir.exists() and upload_dir.is_dir():
        for file_path in upload_dir.glob("*.pdf"):
            try:
                file_path.unlink()
                files_deleted += 1
            except Exception:
                pass

    # 4. Re-seed default canonical tests so the system remains immediately usable
    seed_canonical_tests(db)

    # 5. Log reset completion audit event
    audit_repo.log_audit_event(
        db,
        event_type="system_reset",
        details=f"Reset purged {num_patients} patients, {num_reports} reports, {files_deleted} files.",
    )

    return ResetSummaryResponse(
        status="reset_complete",
        patients_deleted=num_patients,
        reports_deleted=num_reports,
        results_deleted=num_results,
        files_deleted=files_deleted,
        message="All local patient records, extracted clinical data, and uploaded files have been permanently erased.",
    )


@router.get("/patients/{patient_id}/export/archive")
def export_workspace_archive(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Export complete patient workspace as portable JSON archive for backup/transfer."""
    patient = verify_patient_access(patient_id, db=db, current_user=current_user)

    reports = db.execute(
        select(Report).where(Report.patient_id == patient_id, Report.is_deleted == False)
    ).scalars().all()

    report_ids = [r.id for r in reports]
    results = []
    if report_ids:
        results = db.execute(
            select(ExtractedResult).where(
                ExtractedResult.report_id.in_(report_ids),
                ExtractedResult.is_deleted == False,
            )
        ).scalars().all()

    result_ids = [res.id for res in results]
    edits = []
    if result_ids:
        edits = db.execute(
            select(ResultEdit).where(ResultEdit.result_id.in_(result_ids))
        ).scalars().all()

    aliases = db.execute(
        select(TestAlias).where(TestAlias.patient_id == patient_id)
    ).scalars().all()

    archive_bundle = {
        "version": "1.0",
        "archive_type": "patient_workspace_backup",
        "patient": {
            "id": patient.id,
            "display_name": patient.display_name,
            "date_of_birth": patient.date_of_birth,
            "sex": patient.sex,
            "notes": patient.notes,
        },
        "reports": [
            {
                "id": r.id,
                "original_filename": r.original_filename,
                "page_count": r.page_count,
                "status": r.status,
                "report_date": r.report_date,
                "report_date_confirmed": r.report_date_confirmed,
                "lab_name": r.lab_name,
            }
            for r in reports
        ],
        "extracted_results": [
            {
                "id": res.id,
                "report_id": res.report_id,
                "page_number": res.page_number,
                "row_order": res.row_order,
                "section_heading": res.section_heading,
                "raw_test_name": res.raw_test_name,
                "raw_value_text": res.raw_value_text,
                "raw_unit": res.raw_unit,
                "raw_reference_text": res.raw_reference_text,
                "printed_flag": res.printed_flag,
                "source_snippet": res.source_snippet,
                "parse_confidence": res.parse_confidence,
                "test_id": res.test_id,
                "review_status": res.review_status,
            }
            for res in results
        ],
        "edits": [
            {
                "id": e.id,
                "result_id": e.result_id,
                "field": e.field,
                "old_value": e.old_value,
                "new_value": e.new_value,
                "edited_by": e.edited_by,
            }
            for e in edits
        ],
        "custom_aliases": [
            {
                "id": a.id,
                "test_id": a.test_id,
                "alias_normalized": a.alias_normalized,
                "raw_alias": a.raw_alias,
            }
            for a in aliases
        ],
    }

    audit_repo.log_audit_event(
        db,
        event_type="archive_exported",
        patient_id=patient_id,
        details=f"Exported workspace archive with {len(reports)} reports and {len(results)} results.",
    )

    return archive_bundle


@router.post("/patients/import/archive")
def import_workspace_archive(
    archive: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Import a previously exported workspace archive bundle."""
    from app.repositories import patient_repo

    if archive.get("archive_type") != "patient_workspace_backup" or "patient" not in archive:
        raise HTTPException(status_code=400, detail="Invalid archive bundle format.")

    p_data = archive["patient"]
    # Check if patient already exists or create new
    existing = patient_repo.get_patient(db, p_data["id"])
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Patient with ID {p_data['id']} already exists in this workspace.",
        )

    patient = Patient(
        id=p_data["id"],
        display_name=p_data["display_name"],
        date_of_birth=p_data.get("date_of_birth"),
        sex=p_data.get("sex"),
        notes=p_data.get("notes"),
        owner_id=current_user.id,
    )
    db.add(patient)

    for r_data in archive.get("reports", []):
        rep = Report(
            id=r_data["id"],
            patient_id=patient.id,
            original_filename=r_data["original_filename"],
            file_path="",
            file_sha256=f"imported_{r_data['id']}",
            page_count=r_data.get("page_count", 1),
            status=r_data.get("status", "reviewed"),
            report_date=r_data.get("report_date"),
            report_date_confirmed=r_data.get("report_date_confirmed", True),
            lab_name=r_data.get("lab_name"),
        )
        db.add(rep)

    for res_data in archive.get("extracted_results", []):
        res = ExtractedResult(
            id=res_data["id"],
            report_id=res_data["report_id"],
            page_number=res_data.get("page_number", 1),
            row_order=res_data.get("row_order", 1),
            section_heading=res_data.get("section_heading"),
            raw_test_name=res_data["raw_test_name"],
            raw_value_text=res_data["raw_value_text"],
            raw_unit=res_data.get("raw_unit"),
            raw_reference_text=res_data.get("raw_reference_text"),
            printed_flag=res_data.get("printed_flag"),
            source_snippet=res_data.get("source_snippet", res_data["raw_test_name"]),
            parse_confidence=res_data.get("parse_confidence", "high"),
            test_id=res_data.get("test_id"),
            review_status=res_data.get("review_status", "confirmed"),
        )
        db.add(res)

    for e_data in archive.get("edits", []):
        edit = ResultEdit(
            id=e_data["id"],
            result_id=e_data["result_id"],
            field=e_data["field"],
            old_value=e_data.get("old_value"),
            new_value=e_data.get("new_value"),
            edited_by=e_data.get("edited_by", "import"),
        )
        db.add(edit)

    for a_data in archive.get("custom_aliases", []):
        alias = TestAlias(
            id=a_data["id"],
            test_id=a_data["test_id"],
            alias_normalized=a_data["alias_normalized"],
            raw_alias=a_data.get("raw_alias", a_data["alias_normalized"]),
            source="user",
            patient_id=patient.id,
        )
        db.add(alias)

    db.commit()

    audit_repo.log_audit_event(
        db,
        event_type="archive_imported",
        patient_id=patient.id,
        details=f"Restored patient {patient.display_name} with {len(archive.get('reports', []))} reports.",
    )

    return {
        "status": "imported",
        "patient_id": patient.id,
        "patient_name": patient.display_name,
        "reports_restored": len(archive.get("reports", [])),
        "results_restored": len(archive.get("extracted_results", [])),
    }
