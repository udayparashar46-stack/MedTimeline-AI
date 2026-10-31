"""Reports router — upload, extraction, and management endpoints for lab reports.

Endpoints:
  POST   /patients/{patient_id}/reports — upload one or more PDFs & run M4 extraction
  GET    /patients/{patient_id}/reports — list uploaded reports for workspace
  GET    /reports/{report_id}           — get single report metadata
  PATCH  /reports/{report_id}           — confirm/update report date or lab name
  POST   /reports/{report_id}/extract   — re-run text & date extraction pipeline
  GET    /reports/{report_id}/extract   — view raw extracted text & date alternatives
  DELETE /reports/{report_id}           — delete report and remove disk file
"""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.db.session import get_db
from app.db.models.user import User
from app.repositories import report_repo, result_repo, audit_repo
from app.schemas.report import (
    ReportResponse,
    ReportListResponse,
    ReportUploadItem,
    BatchUploadResponse,
    ReportUpdate,
    ReportExtractionResponse,
)
from app.schemas.result import (
    ReportResultsResponse,
    ReportResultsSummary,
    ExtractedResultResponse,
    ManualResultCreate,
)
from app.services.storage import storage_service
from app.services.extraction import extract_report_from_bytes
from app.api.v1.results import format_result_response
from app.api.deps import get_current_user, verify_patient_access, verify_report_access

router = APIRouter(tags=["reports"])


@router.post(
    "/patients/{patient_id}/reports",
    response_model=BatchUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_reports(
    patient_id: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BatchUploadResponse:
    """Upload one or more PDF reports for a patient workspace.

    Validates:
    - User has access to this patient workspace (tenant isolation)
    - Batch size (<= 25 files)
    - File extension (.pdf), size limit (<= 20MB), magic bytes (%PDF-), and structural validity
    - SHA-256 duplicate detection per patient workspace (duplicate files are warned & skipped)
    - Automatically executes M4 text-layer & date extraction pipeline on accepted files
    """
    patient = verify_patient_access(patient_id, db=db, current_user=current_user)

    if not files:
        raise HTTPException(status_code=400, detail="No files provided for upload.")

    if len(files) > settings.MAX_FILES_PER_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds maximum limit of {settings.MAX_FILES_PER_BATCH} files.",
        )

    results: list[ReportUploadItem] = []
    uploaded_count = 0
    skipped_count = 0
    failed_count = 0

    for file in files:
        filename = file.filename or "unknown.pdf"
        try:
            content = await file.read()
        except Exception:
            results.append(
                ReportUploadItem(
                    filename=filename,
                    status="failed",
                    message="Failed to read uploaded file content.",
                )
            )
            failed_count += 1
            continue

        # Validation: extension, size, magic bytes across PDF, Images, DOCX
        is_valid, page_count, detected_fmt, err_msg = storage_service.validate_file(content, filename)
        if not is_valid:
            results.append(
                ReportUploadItem(
                    filename=filename,
                    status="failed",
                    message=err_msg or "File failed format validation.",
                )
            )
            failed_count += 1
            continue

        # SHA-256 duplicate detection
        sha256 = storage_service.compute_sha256(content)
        existing = report_repo.get_report_by_sha256(db, patient_id, sha256)
        if existing:
            results.append(
                ReportUploadItem(
                    filename=filename,
                    status="duplicate_skipped",
                    report=ReportResponse.model_validate(existing),
                    message=(
                        f"Duplicate skipped: file matches report '{existing.original_filename}' "
                        f"already in this workspace."
                    ),
                )
            )
            skipped_count += 1
            continue

        # Universal extraction pipeline: run text, metadata & row extraction defensively
        try:
            extraction = extract_report_from_bytes(
                content,
                filename=filename,
                target_patient_name=patient.display_name,
            )
        except Exception as e:
            logger.error(f"Extraction error for file {filename}: {e}", exc_info=True)
            from app.services.extraction.pipeline import ExtractionResult, EXTRACTION_VERSION
            extraction = ExtractionResult(
                has_text_layer=True,
                is_scanned=False,
                total_characters=0,
                page_count=page_count,
                status="needs_review",
                failure_reason=f"Automated parser encountered an unexpected structure: {str(e)[:120]}. Manual review required.",
                report_date=None,
                report_date_source_text=None,
                is_date_ambiguous=False,
                date_alternatives=[],
                extracted_text="",
                extraction_version=EXTRACTION_VERSION,
                rows=[],
            )

        # Prepare renderable representation for storage (so split-view viewer can view it as PDF)
        renderable_bytes = extraction.renderable_pdf_bytes or storage_service.prepare_renderable_pdf(content, detected_fmt, filename)

        # Save to disk with UUID filename
        try:
            storage_key = storage_service.save_file(renderable_bytes)
        except Exception:
            results.append(
                ReportUploadItem(
                    filename=filename,
                    status="failed",
                    message="Failed to save file to secure storage.",
                )
            )
            failed_count += 1
            continue

        # Create Report record in database
        report = report_repo.create_report(
            db=db,
            patient_id=patient.id,
            original_filename=filename,
            file_path=storage_key,
            file_sha256=sha256,
            file_size_bytes=len(content),
            page_count=extraction.page_count or page_count,
            status=extraction.status,
            failure_reason=extraction.failure_reason,
            has_text_layer=extraction.has_text_layer,
            report_date=extraction.report_date,
            report_date_source_text=extraction.report_date_source_text,
            is_date_ambiguous=extraction.is_date_ambiguous,
            date_alternatives=json.dumps(extraction.date_alternatives),
            extracted_text=extraction.extracted_text,
            extraction_version=extraction.extraction_version,
            lab_name=extraction.lab_name,
        )

        # Milestone 5: Persist extracted rows into ExtractedResult
        if extraction.rows:
            try:
                result_repo.create_results_from_candidates(db, report.id, extraction.rows)
            except Exception as e:
                logger.error(f"Failed to persist extracted rows for report {report.id}: {e}", exc_info=True)

        results.append(
            ReportUploadItem(
                filename=filename,
                status="uploaded",
                report=ReportResponse.model_validate(report),
                message="Report uploaded and processed successfully.",
            )
        )
        uploaded_count += 1

        audit_repo.log_audit_event(
            db,
            event_type="report_uploaded",
            patient_id=patient.id,
            entity_id=report.id,
            details=f"filename={filename}, pages={page_count}, status={extraction.status}",
        )

    return BatchUploadResponse(
        items=results,
        uploaded_count=uploaded_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
    )


@router.get(
    "/patients/{patient_id}/reports",
    response_model=ReportListResponse,
)
def list_patient_reports(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportListResponse:
    """List all reports uploaded for a patient workspace."""
    verify_patient_access(patient_id, db=db, current_user=current_user)
    reports, total = report_repo.list_reports_for_patient(db, patient_id)
    return ReportListResponse(
        items=[ReportResponse.model_validate(r) for r in reports],
        total=total,
    )


@router.get("/reports/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportResponse:
    """Get metadata for a single report."""
    report = verify_report_access(report_id, db=db, current_user=current_user)
    return ReportResponse.model_validate(report)


@router.patch("/reports/{report_id}", response_model=ReportResponse)
def update_report(
    report_id: str,
    data: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportResponse:
    """Update report metadata (e.g. user confirming/changing report date or lab name)."""
    report = verify_report_access(report_id, db=db, current_user=current_user)

    updates = {}
    if data.report_date is not None:
        updates["report_date"] = data.report_date
        updates["report_date_confirmed"] = True
        updates["is_date_ambiguous"] = False
        updates["failure_reason"] = None

    if data.report_date_confirmed is not None:
        updates["report_date_confirmed"] = data.report_date_confirmed
        if data.report_date_confirmed:
            updates["is_date_ambiguous"] = False
            updates["failure_reason"] = None

    if data.lab_name is not None:
        updates["lab_name"] = data.lab_name

    if data.status is not None:
        if data.status == "reviewed":
            # Gating: must have confirmed report date
            is_date_confirmed = (
                data.report_date_confirmed
                if data.report_date_confirmed is not None
                else report.report_date_confirmed
            )
            if not is_date_confirmed:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot mark report as reviewed: report collection date must be confirmed first.",
                )
        updates["status"] = data.status

    updated_report = report_repo.update_report(db, report, updates)
    return ReportResponse.model_validate(updated_report)


@router.get("/reports/{report_id}/file")
@router.get("/reports/{report_id}/pdf")
def get_report_file(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream the raw PDF file for viewing in the split-screen review interface."""
    report = verify_report_access(report_id, db=db, current_user=current_user)

    file_bytes = storage_service.get_file_bytes(report.file_path)
    if file_bytes is None:
        file_path = storage_service.get_file_path(report.file_path)
        if file_path and file_path.exists():
            return FileResponse(
                path=str(file_path),
                media_type="application/pdf",
                filename=report.original_filename,
            )
        raise HTTPException(status_code=404, detail="PDF file not found in storage.")

    audit_repo.log_audit_event(
        db,
        event_type="file_accessed",
        patient_id=report.patient_id,
        entity_id=report.id,
        details=f"Streamed file {report.original_filename}",
    )

    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{report.original_filename}"'},
    )


@router.post(
    "/reports/{report_id}/results",
    response_model=ExtractedResultResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_manual_result(
    report_id: str,
    data: ManualResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExtractedResultResponse:
    """Manually add a clinical test row to a report."""
    report = verify_report_access(report_id, db=db, current_user=current_user)
    res = result_repo.create_manual_result(db, report.id, data)
    return format_result_response(res)


@router.post("/reports/{report_id}/extract", response_model=ReportResponse)
def trigger_extraction(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportResponse:
    """Re-run M4 text-layer and date extraction on an uploaded report."""
    report = verify_report_access(report_id, db=db, current_user=current_user)

    content = storage_service.get_file_bytes(report.file_path)
    if content is None:
        file_path = storage_service.get_file_path(report.file_path)
        if file_path and file_path.exists():
            content = file_path.read_bytes()
        else:
            raise HTTPException(status_code=404, detail="Underlying PDF file missing from storage.")

    extraction = extract_report_from_bytes(content, filename=report.original_filename)

    updates = {
        "status": extraction.status,
        "failure_reason": extraction.failure_reason,
        "has_text_layer": extraction.has_text_layer,
        "report_date": extraction.report_date,
        "report_date_source_text": extraction.report_date_source_text,
        "is_date_ambiguous": extraction.is_date_ambiguous,
        "date_alternatives": json.dumps(extraction.date_alternatives),
        "extracted_text": extraction.extracted_text,
        "extraction_version": extraction.extraction_version,
    }

    updated = report_repo.update_report(db, report, updates)

    # Milestone 5: Re-create extracted rows
    result_repo.delete_results_for_report(db, report.id)
    if extraction.rows:
        result_repo.create_results_from_candidates(db, report.id, extraction.rows)

    return ReportResponse.model_validate(updated)


@router.get("/reports/{report_id}/results", response_model=ReportResultsResponse)
def get_report_results(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportResultsResponse:
    """Retrieve all parsed test rows, confidence breakdown, and summary for a report."""
    report = verify_report_access(report_id, db=db, current_user=current_user)

    rows = result_repo.list_results_for_report(db, report.id)

    total_rows = len(rows)
    needs_review = sum(1 for r in rows if r.review_status == "unreviewed")
    high_c = sum(1 for r in rows if r.parse_confidence == "high")
    med_c = sum(1 for r in rows if r.parse_confidence == "medium")
    low_c = sum(1 for r in rows if r.parse_confidence == "low")

    result_items: list[ExtractedResultResponse] = [
        format_result_response(r) for r in rows
    ]

    summary = ReportResultsSummary(
        total_rows=total_rows,
        needs_review_count=needs_review,
        high_confidence_count=high_c,
        medium_confidence_count=med_c,
        low_confidence_count=low_c,
        skipped_lines_count=0,
    )

    return ReportResultsResponse(
        report_id=report.id,
        summary=summary,
        results=result_items,
    )


@router.get("/reports/{report_id}/extract", response_model=ReportExtractionResponse)
def get_extraction_details(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportExtractionResponse:
    """View raw extracted text and date alternatives for debugging."""
    report = verify_report_access(report_id, db=db, current_user=current_user)

    alternatives = []
    if report.date_alternatives:
        try:
            alternatives = json.loads(report.date_alternatives)
        except Exception:
            alternatives = []

    return ReportExtractionResponse(
        report_id=report.id,
        patient_id=report.patient_id,
        original_filename=report.original_filename,
        has_text_layer=report.has_text_layer,
        is_scanned=not report.has_text_layer,
        status=report.status,
        failure_reason=report.failure_reason,
        report_date=report.report_date,
        report_date_source_text=report.report_date_source_text,
        report_date_confirmed=report.report_date_confirmed,
        is_date_ambiguous=report.is_date_ambiguous,
        date_alternatives=alternatives,
        extracted_text=report.extracted_text,
        extraction_version=report.extraction_version,
    )


@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a report and remove its underlying file from storage."""
    report = verify_report_access(report_id, db=db, current_user=current_user)

    storage_service.delete_file(report.file_path)
    report_repo.delete_report(db, report)
    audit_repo.log_audit_event(
        db,
        event_type="report_deleted",
        patient_id=report.patient_id,
        entity_id=report.id,
        details=f"filename={report.original_filename}",
    )
    return None
