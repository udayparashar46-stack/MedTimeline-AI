"""Results router — endpoints for reviewing, editing, and confirming individual test rows.

Endpoints:
  PATCH /results/{id}          — Edit test name/value/units/flags, confirm, or reject (logs ResultEdit)
  POST  /results/{id}/undo     — Revert most recent edit
  POST  /results/bulk-confirm  — Confirm multiple unreviewed rows at once
"""

import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.user import User
from app.repositories import result_repo
from app.schemas.result import (
    ExtractedResultResponse,
    ResultUpdate,
    BulkConfirmRequest,
    BulkConfirmResponse,
    ResultEditResponse,
)
from app.api.deps import get_current_user, verify_result_access, verify_report_access

router = APIRouter(prefix="/results", tags=["results"])


def format_result_response(r) -> ExtractedResultResponse:
    """Format an ExtractedResult ORM model into an API response with effective values and edits."""
    ref_low, ref_high = r.derived_ref_range
    edits = [
        ResultEditResponse(
            id=e.id,
            result_id=e.result_id,
            field=e.field,
            old_value=e.old_value,
            new_value=e.new_value,
            edited_by=e.edited_by,
            created_at=e.created_at,
        )
        for e in r.edits
    ]

    return ExtractedResultResponse(
        id=r.id,
        report_id=r.report_id,
        page_number=r.page_number,
        row_order=r.row_order,
        section_heading=r.section_heading,
        raw_test_name=r.raw_test_name,
        raw_value_text=r.raw_value_text,
        raw_unit=r.raw_unit,
        raw_reference_text=r.raw_reference_text,
        printed_flag=r.printed_flag,
        source_snippet=r.source_snippet,
        bbox=json.loads(r.bbox) if r.bbox else None,
        parse_confidence=r.parse_confidence,
        test_id=r.test_id,
        canonical_name=r.test.canonical_name if getattr(r, "test", None) else None,
        review_status=r.review_status,
        effective_test_name=r.effective_test_name,
        effective_value_text=r.effective_value_text,
        effective_unit=r.effective_unit,
        effective_reference_text=r.effective_reference_text,
        effective_printed_flag=r.effective_printed_flag,
        value_numeric=r.derived_value_numeric,
        ref_low=ref_low,
        ref_high=ref_high,
        comparator=r.derived_comparator,
        has_edits=len(r.edits) > 0,
        edits=edits,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.patch("/{result_id}", response_model=ExtractedResultResponse)
def update_result(
    result_id: str,
    data: ResultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExtractedResultResponse:
    """Update result fields or review status. Creates audit log entries in ResultEdit."""
    res = verify_result_access(result_id, db=db, current_user=current_user)

    if data.review_status and data.review_status not in [
        "unreviewed",
        "confirmed",
        "edited",
        "rejected",
        "manual",
    ]:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid review_status '{data.review_status}'. Allowed: unreviewed, confirmed, edited, rejected, manual.",
        )

    updated = result_repo.apply_result_edit(db, res, data)
    return format_result_response(updated)


@router.post("/{result_id}/undo", response_model=ExtractedResultResponse)
def undo_result_edit(
    result_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExtractedResultResponse:
    """Revert the most recent edit applied to this result row."""
    res = verify_result_access(result_id, db=db, current_user=current_user)

    updated, undone_edit = result_repo.undo_last_edit(db, res)
    if undone_edit is None:
        raise HTTPException(status_code=400, detail="No edits to undo for this result.")

    return format_result_response(updated)


@router.post("/bulk-confirm", response_model=BulkConfirmResponse)
def bulk_confirm(
    data: BulkConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkConfirmResponse:
    """Bulk confirm unreviewed rows in a report (e.g. all high-confidence rows)."""
    verify_report_access(data.report_id, db=db, current_user=current_user)

    confirmed = result_repo.bulk_confirm_results(
        db=db,
        report_id=data.report_id,
        confidence=data.confidence or "high",
        result_ids=data.result_ids,
    )
    return BulkConfirmResponse(
        report_id=data.report_id,
        confirmed_count=len(confirmed),
        results=[format_result_response(r) for r in confirmed],
    )
