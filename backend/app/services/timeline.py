"""Timeline builder service (Milestone 8).

Builds the chronological timeline matrix for a patient workspace:
- Columns: Reports with extracted results, ordered chronologically (ascending date).
  Two reports on the same date appear as separate columns (FR5).
- Rows: Canonical tests (and unmapped tests) grouped by category.
- Cells: Effective values with audit/edit tracking, blank when no result exists.
- Review filter: include_unreviewed=False excludes unreviewed results.
  Rejected rows are always excluded from the timeline.
"""

from typing import List, Dict, Tuple, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.models.patient import Patient
from app.db.models.report import Report
from app.db.models.extracted_result import ExtractedResult
from app.db.models.test import Test
from app.schemas.timeline import (
    TimelineResponse,
    TimelineReportColumn,
    TimelineRow,
    TimelineCell,
)


def format_display_date(date_str: Optional[str]) -> str:
    """Format YYYY-MM-DD to 'DD Mon YYYY' or 'No Date'."""
    if not date_str:
        return "No Date"
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%d %b %Y")
    except Exception:
        return date_str


def build_patient_timeline(
    db: Session,
    patient_id: str,
    include_unreviewed: bool = False,
) -> TimelineResponse:
    """Build the complete chronological timeline matrix for a patient workspace."""
    # 1. Fetch patient
    patient = db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.is_deleted == False)
    ).scalar_one_or_none()

    if not patient:
        return TimelineResponse(
            patient_id=patient_id,
            patient_name="Unknown Patient",
            columns=[],
            rows=[],
            total_tests=0,
            total_columns=0,
            categories=[],
            has_unreviewed_results=False,
            include_unreviewed=include_unreviewed,
        )

    # 2. Fetch all active reports for this patient
    reports_query = select(Report).where(
        Report.patient_id == patient_id,
        Report.is_deleted == False,
    )
    all_reports = list(db.execute(reports_query).scalars().all())

    # 3. Fetch all extracted results for these reports
    report_ids = [r.id for r in all_reports]
    if not report_ids:
        return TimelineResponse(
            patient_id=patient.id,
            patient_name=patient.display_name,
            columns=[],
            rows=[],
            total_tests=0,
            total_columns=0,
            categories=[],
            has_unreviewed_results=False,
            include_unreviewed=include_unreviewed,
        )

    results_query = (
        select(ExtractedResult)
        .where(
            ExtractedResult.report_id.in_(report_ids),
            ExtractedResult.is_deleted == False,
        )
        .order_by(ExtractedResult.row_order.asc())
    )
    all_results = list(db.execute(results_query).scalars().all())

    # Check if there are any unreviewed results at all for the patient
    has_unreviewed_results = any(
        res.review_status == "unreviewed" for res in all_results
    )

    # Filter results by review status
    # Rejected results are never included in the timeline
    valid_results: List[ExtractedResult] = []
    for res in all_results:
        if res.review_status == "rejected":
            continue
        if not include_unreviewed and res.review_status == "unreviewed":
            continue
        valid_results.append(res)

    # 4. Filter and sort reports that have at least one valid result
    active_report_ids_with_data = {res.report_id for res in valid_results}
    timeline_reports = [r for r in all_reports if r.id in active_report_ids_with_data]

    # Chronological sort: ascending by report_date (nulls last or first? Sort with date, tiebreak by created_at)
    def report_sort_key(r: Report):
        # Reports with date come first in ascending order, reports without date come after
        return (0 if r.report_date else 1, r.report_date or "", r.created_at)

    timeline_reports.sort(key=report_sort_key)

    # Build report columns
    columns: List[TimelineReportColumn] = [
        TimelineReportColumn(
            report_id=r.id,
            report_date=r.report_date,
            formatted_date=format_display_date(r.report_date),
            lab_name=r.lab_name,
            original_filename=r.original_filename,
            report_status=r.status,
            report_date_confirmed=r.report_date_confirmed,
        )
        for r in timeline_reports
    ]

    # 5. Group results into rows
    # Each row corresponds to either a canonical test (test_id) or an unmapped test name
    # Rows are identified by: test_id if present, else ("unmapped", normalized_name)
    test_ids = {res.test_id for res in valid_results if res.test_id}
    canonical_tests_map: Dict[str, Test] = {}
    if test_ids:
        tests = db.execute(select(Test).where(Test.id.in_(test_ids))).scalars().all()
        canonical_tests_map = {t.id: t for t in tests}

    # Structure to build rows:
    # row_key -> {
    #   'test_id': Optional[str],
    #   'test_name': str,
    #   'category': str,
    #   'preferred_unit': Optional[str],
    #   'is_canonical': bool,
    #   'cells': Dict[str, TimelineCell],
    #   'observed_units': set()
    # }
    rows_dict: Dict[str, dict] = {}

    for res in valid_results:
        cell = TimelineCell(
            result_id=res.id,
            report_id=res.report_id,
            raw_test_name=res.raw_test_name,
            effective_value_text=res.effective_value_text,
            effective_unit=res.effective_unit,
            effective_reference_text=res.effective_reference_text,
            printed_flag=res.effective_printed_flag,
            review_status=res.review_status,
            parse_confidence=res.parse_confidence,
            page_number=res.page_number,
            source_snippet=res.source_snippet,
            is_edited=bool(res.edits and len(res.edits) > 0),
            derived_value_numeric=res.derived_value_numeric,
            derived_comparator=res.derived_comparator,
        )

        if res.test_id and res.test_id in canonical_tests_map:
            c_test = canonical_tests_map[res.test_id]
            row_key = f"canonical:{c_test.id}"
            test_name = c_test.canonical_name
            category = c_test.category or "Ungrouped"
            preferred_unit = c_test.preferred_unit
            is_canonical = True
        else:
            row_key = f"unmapped:{res.effective_test_name.lower().strip()}"
            test_name = res.effective_test_name
            category = res.section_heading or "Ungrouped"
            preferred_unit = None
            is_canonical = False

        if row_key not in rows_dict:
            rows_dict[row_key] = {
                "test_id": res.test_id if is_canonical else None,
                "test_name": test_name,
                "category": category,
                "preferred_unit": preferred_unit,
                "is_canonical": is_canonical,
                "cells": {},
                "observed_units": set(),
            }

        # If multiple results exist for the same test in the same report,
        # keep the first or latest row order (FR5: separate report columns handle distinct reports,
        # within same report if duplicated, keep the valid one)
        if res.report_id not in rows_dict[row_key]["cells"]:
            rows_dict[row_key]["cells"][res.report_id] = cell

        if res.effective_unit:
            rows_dict[row_key]["observed_units"].add(res.effective_unit.strip())

    # Sort rows by category, then by test name
    # Known clinical category order
    category_order = {
        "Complete Blood Count": 1,
        "Hematology": 1,
        "Biochemistry": 2,
        "Lipid Profile": 3,
        "Liver Function": 4,
        "Liver Function Tests": 4,
        "Renal Function": 5,
        "Kidney Function Tests": 5,
        "Renal Panel": 5,
        "Electrolytes": 6,
        "Diabetes": 7,
        "Thyroid": 8,
        "Thyroid Profile": 8,
        "Vitamins": 9,
        "Urine Examination": 10,
        "Ungrouped": 99,
    }

    def row_sort_key(item: Tuple[str, dict]):
        data = item[1]
        cat = data["category"]
        cat_rank = category_order.get(cat, 50)
        return (cat_rank, cat, data["test_name"].lower())

    sorted_row_items = sorted(rows_dict.items(), key=row_sort_key)

    timeline_rows: List[TimelineRow] = []
    categories_seen: List[str] = []

    for _, row_data in sorted_row_items:
        cat = row_data["category"]
        if cat not in categories_seen:
            categories_seen.append(cat)

        observed_units_list = sorted(list(row_data["observed_units"]))
        # Unit mismatch if more than 1 distinct unit observed
        has_mismatch = len(observed_units_list) > 1

        timeline_rows.append(
            TimelineRow(
                test_id=row_data["test_id"],
                test_name=row_data["test_name"],
                category=cat,
                preferred_unit=row_data["preferred_unit"],
                is_canonical=row_data["is_canonical"],
                cells=row_data["cells"],
                has_unit_mismatch=has_mismatch,
                observed_units=observed_units_list,
            )
        )

    return TimelineResponse(
        patient_id=patient.id,
        patient_name=patient.display_name,
        columns=columns,
        rows=timeline_rows,
        total_tests=len(timeline_rows),
        total_columns=len(columns),
        categories=categories_seen,
        has_unreviewed_results=has_unreviewed_results,
        include_unreviewed=include_unreviewed,
    )
