"""Timeline and Export API routes (Milestones 8 & 9).

Endpoints:
- GET /patients/{id}/timeline: Matrix of chronological columns and test rows.
- GET /patients/{id}/export/csv: Download CSV export with disclaimer and sanitized formulas.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories import patient_repo
from app.schemas.timeline import TimelineResponse
from app.services.timeline import build_patient_timeline
from app.services.exporters.csv_export import export_patient_timeline_csv

router = APIRouter(prefix="/patients", tags=["timeline", "exports"])


@router.get("/{patient_id}/timeline", response_model=TimelineResponse)
def get_patient_timeline(
    patient_id: str,
    include_unreviewed: bool = Query(
        False,
        description="Include unreviewed results alongside confirmed results in the timeline",
    ),
    db: Session = Depends(get_db),
) -> TimelineResponse:
    """Retrieve chronological timeline matrix for a patient workspace."""
    patient = patient_repo.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient workspace not found.")

    return build_patient_timeline(db, patient_id=patient_id, include_unreviewed=include_unreviewed)


@router.get("/{patient_id}/export/csv")
def export_timeline_csv(
    patient_id: str,
    include_unreviewed: bool = Query(
        False,
        description="Include unreviewed results in the CSV export",
    ),
    db: Session = Depends(get_db),
):
    """Download timeline matrix as spreadsheet-friendly CSV with disclaimer."""
    patient = patient_repo.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient workspace not found.")

    csv_content, filename = export_patient_timeline_csv(
        db, patient_id=patient_id, include_unreviewed=include_unreviewed
    )

    # Prepend UTF-8 BOM (\ufeff) so Microsoft Excel opens it seamlessly without character corruption
    csv_bytes = b"\xef\xbb\xbf" + csv_content.encode("utf-8")

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )
