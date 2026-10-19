"""Result repository — all DB operations for ExtractedResult and ResultEdit models.

Follows repository pattern: isolates SQLAlchemy queries so routers stay thin.
"""

import json
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, func, delete

from app.db.models.extracted_result import ExtractedResult
from app.db.models.result_edit import ResultEdit
from app.db.models.report import Report
from app.services.extraction.parsers.layout_models import ParsedRowCandidate
from app.schemas.result import ManualResultCreate, ResultUpdate
from app.services.normalization.matcher import find_matching_test


def create_results_from_candidates(
    db: Session, report_id: str, candidates: List[ParsedRowCandidate]
) -> List[ExtractedResult]:
    """Insert batch of parsed row candidates for a report with auto-normalization."""
    patient_id = db.execute(
        select(Report.patient_id).where(Report.id == report_id)
    ).scalar_one_or_none()

    results: List[ExtractedResult] = []

    for c in candidates:
        bbox_json = json.dumps(c.bbox) if c.bbox else None
        match = find_matching_test(db, c.raw_test_name, patient_id)

        res = ExtractedResult(
            report_id=report_id,
            page_number=c.page_number,
            row_order=c.row_order,
            section_heading=c.section_heading,
            raw_test_name=c.raw_test_name,
            raw_value_text=c.raw_value_text,
            raw_unit=c.raw_unit,
            raw_reference_text=c.raw_reference_text,
            printed_flag=c.printed_flag,
            source_snippet=c.source_snippet,
            bbox=bbox_json,
            parse_confidence=c.parse_confidence,
            test_id=match.id if match else None,
            review_status="unreviewed",
        )
        db.add(res)
        results.append(res)

    db.commit()
    for r in results:
        db.refresh(r)
    return results


def create_manual_result(
    db: Session, report_id: str, data: ManualResultCreate
) -> ExtractedResult:
    """Manually add a test result row to a report."""
    # Find max row_order for this report
    max_order_query = select(func.max(ExtractedResult.row_order)).where(
        ExtractedResult.report_id == report_id
    )
    max_order = db.execute(max_order_query).scalar_one_or_none() or 0

    patient_id = db.execute(
        select(Report.patient_id).where(Report.id == report_id)
    ).scalar_one_or_none()
    match = find_matching_test(db, data.test_name, patient_id)

    res = ExtractedResult(
        report_id=report_id,
        page_number=data.page_number,
        row_order=max_order + 1,
        section_heading=data.section_heading,
        raw_test_name=data.test_name,
        raw_value_text=data.value_text,
        raw_unit=data.unit,
        raw_reference_text=data.reference_text,
        printed_flag=data.printed_flag,
        source_snippet="Manual user entry",
        bbox=None,
        parse_confidence="high",
        test_id=match.id if match else None,
        review_status="manual",
    )
    db.add(res)
    db.commit()
    db.refresh(res)
    return res


def list_results_for_report(db: Session, report_id: str) -> List[ExtractedResult]:
    """Retrieve all extracted results for a report ordered by page and row."""
    stmt = (
        select(ExtractedResult)
        .where(ExtractedResult.report_id == report_id, ExtractedResult.is_deleted == False)
        .order_by(ExtractedResult.page_number.asc(), ExtractedResult.row_order.asc())
    )
    return list(db.execute(stmt).scalars().all())


def delete_results_for_report(db: Session, report_id: str) -> int:
    """Hard delete all extracted results for a report."""
    stmt = delete(ExtractedResult).where(ExtractedResult.report_id == report_id)
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0


def get_result(db: Session, result_id: str) -> Optional[ExtractedResult]:
    """Get a single extracted result by ID."""
    stmt = select(ExtractedResult).where(
        ExtractedResult.id == result_id, ExtractedResult.is_deleted == False
    )
    return db.execute(stmt).scalar_one_or_none()


def apply_result_edit(
    db: Session, result: ExtractedResult, data: ResultUpdate
) -> ExtractedResult:
    """Apply corrections to a result row, logging audit records in ResultEdit.
    
    The raw_* columns in ExtractedResult are NEVER mutated.
    """
    field_mappings = [
        ("raw_test_name", data.test_name),
        ("raw_value_text", data.value_text),
        ("raw_unit", data.unit),
        ("raw_reference_text", data.reference_text),
        ("printed_flag", data.printed_flag),
    ]

    has_content_edit = False

    for field_name, new_val in field_mappings:
        if new_val is not None:
            old_val = result.get_effective_value(field_name)
            if old_val != new_val:
                edit = ResultEdit(
                    result_id=result.id,
                    field=field_name,
                    old_value=str(old_val) if old_val is not None else None,
                    new_value=str(new_val),
                    edited_by="user",
                )
                db.add(edit)
                has_content_edit = True

    if data.test_name is not None:
        patient_id = result.report.patient_id if result.report else None
        match = find_matching_test(db, data.test_name, patient_id)
        result.test_id = match.id if match else None

    # Handle review_status changes
    old_status = result.review_status
    if data.review_status is not None:
        if old_status != data.review_status:
            edit = ResultEdit(
                result_id=result.id,
                field="review_status",
                old_value=old_status,
                new_value=data.review_status,
                edited_by="user",
            )
            db.add(edit)
            result.review_status = data.review_status
    elif has_content_edit and old_status not in ["confirmed", "edited"]:
        # If content changed and status not explicitly specified, set to 'edited'
        edit = ResultEdit(
            result_id=result.id,
            field="review_status",
            old_value=old_status,
            new_value="edited",
            edited_by="user",
        )
        db.add(edit)
        result.review_status = "edited"

    db.commit()
    db.refresh(result)
    return result


def undo_last_edit(
    db: Session, result: ExtractedResult
) -> Tuple[ExtractedResult, Optional[ResultEdit]]:
    """Revert the most recent ResultEdit for this result."""
    stmt = (
        select(ResultEdit)
        .where(ResultEdit.result_id == result.id)
        .order_by(ResultEdit.created_at.desc())
        .limit(1)
    )
    last_edit = db.execute(stmt).scalar_one_or_none()
    if not last_edit:
        return result, None

    # Delete the last edit record
    db.delete(last_edit)
    db.commit()
    db.refresh(result)

    # Re-evaluate review_status from remaining edits
    status_stmt = (
        select(ResultEdit)
        .where(ResultEdit.result_id == result.id, ResultEdit.field == "review_status")
        .order_by(ResultEdit.created_at.desc())
        .limit(1)
    )
    prev_status_edit = db.execute(status_stmt).scalar_one_or_none()
    if prev_status_edit:
        result.review_status = prev_status_edit.new_value or "unreviewed"
    else:
        # Check if any content edits remain
        remaining_edits = (
            db.execute(select(func.count()).select_from(ResultEdit).where(ResultEdit.result_id == result.id))
            .scalar_one()
        )
        if remaining_edits > 0:
            result.review_status = "edited"
        else:
            result.review_status = "unreviewed"

    db.commit()
    db.refresh(result)
    return result, last_edit


def bulk_confirm_results(
    db: Session,
    report_id: str,
    confidence: str = "high",
    result_ids: Optional[List[str]] = None,
) -> List[ExtractedResult]:
    """Bulk confirm unreviewed results matching the specified criteria."""
    query = select(ExtractedResult).where(
        ExtractedResult.report_id == report_id,
        ExtractedResult.is_deleted == False,
    )

    if result_ids:
        query = query.where(ExtractedResult.id.in_(result_ids))
    else:
        query = query.where(
            ExtractedResult.review_status == "unreviewed",
            ExtractedResult.parse_confidence == confidence,
        )

    matching_results = list(db.execute(query).scalars().all())

    for res in matching_results:
        old_status = res.review_status
        edit = ResultEdit(
            result_id=res.id,
            field="review_status",
            old_value=old_status,
            new_value="confirmed",
            edited_by="user",
        )
        db.add(edit)
        res.review_status = "confirmed"

    db.commit()
    for res in matching_results:
        db.refresh(res)
    return matching_results
