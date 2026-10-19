"""Timeline and Export API routes (Milestones 8 & 9).

Endpoints:
- GET /patients/{id}/timeline: Matrix of chronological columns and test rows.
- GET /patients/{id}/export/csv: Download CSV export with disclaimer and sanitized formulas.
- GET /patients/{id}/export/pdf: Download PDF export with disclaimer and page headers.
"""

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.user import User
from app.schemas.timeline import TimelineResponse
from app.services.timeline import build_patient_timeline
from app.services.exporters.csv_export import export_patient_timeline_csv
from app.services.exporters.pdf_export import export_patient_timeline_pdf
from app.api.deps import get_current_user, verify_patient_access

router = APIRouter(prefix="/patients", tags=["timeline", "exports"])


@router.get("/{patient_id}/timeline", response_model=TimelineResponse)
def get_patient_timeline(
    patient_id: str,
    include_unreviewed: bool = Query(
        False,
        description="Include unreviewed results alongside confirmed results in the timeline",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TimelineResponse:
    """Retrieve chronological timeline matrix for a patient workspace."""
    verify_patient_access(patient_id, db=db, current_user=current_user)
    return build_patient_timeline(db, patient_id=patient_id, include_unreviewed=include_unreviewed)


@router.get("/{patient_id}/export/csv")
def export_timeline_csv(
    patient_id: str,
    include_unreviewed: bool = Query(
        False,
        description="Include unreviewed results in the CSV export",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download timeline matrix as spreadsheet-friendly CSV with disclaimer."""
    verify_patient_access(patient_id, db=db, current_user=current_user)

    csv_content, filename = export_patient_timeline_csv(
        db, patient_id=patient_id, include_unreviewed=include_unreviewed
    )

    # Prepend UTF-8 BOM (\ufeff) so Microsoft Excel opens it seamlessly without character corruption
    csv_bytes = b"\xef\xbb\xbf" + csv_content.encode("utf-8")

    from app.repositories import audit_repo
    audit_repo.log_audit_event(
        db,
        event_type="timeline_exported_csv",
        patient_id=patient_id,
        details=f"filename={filename}, include_unreviewed={include_unreviewed}",
    )

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


@router.get("/{patient_id}/export/pdf")
def export_timeline_pdf(
    patient_id: str,
    include_unreviewed: bool = Query(
        False,
        description="Include unreviewed results in the PDF export",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download timeline matrix as print-friendly landscape PDF with disclaimer."""
    verify_patient_access(patient_id, db=db, current_user=current_user)

    pdf_bytes, filename = export_patient_timeline_pdf(
        db, patient_id=patient_id, include_unreviewed=include_unreviewed
    )

    from app.repositories import audit_repo
    audit_repo.log_audit_event(
        db,
        event_type="timeline_exported_pdf",
        patient_id=patient_id,
        details=f"filename={filename}, include_unreviewed={include_unreviewed}",
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf",
        },
    )
