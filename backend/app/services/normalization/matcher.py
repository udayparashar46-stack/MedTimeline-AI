"""Matching and suggestion engine for lab test normalization.

Follows blueprint Section 9:
- Exact matching against TestAlias (patient-scoped takes precedence over global)
- Deterministic similarity suggestions for unmatched names (using SequenceMatcher)
- Suggestions are NEVER auto-applied without user confirmation
- Strict clinical distinction: "Total" vs "Direct" tests are never cross-suggested with false confidence
- Unit mismatch detection across reports for the same canonical test
"""

import difflib
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.models.test import Test
from app.db.models.test_alias import TestAlias
from app.db.models.extracted_result import ExtractedResult
from app.db.models.report import Report
from app.services.normalization.normalizer import normalize_test_name


def find_matching_test(
    db: Session, raw_test_name: str, patient_id: Optional[str] = None
) -> Optional[Test]:
    """Perform exact normalized alias match for a raw test name.
    
    Patient-specific aliases take precedence over global seed aliases.
    """
    norm = normalize_test_name(raw_test_name)
    if not norm:
        return None

    # 1. Check patient-specific alias if patient_id is provided
    if patient_id:
        patient_alias = db.execute(
            select(TestAlias).where(
                TestAlias.alias_normalized == norm,
                TestAlias.patient_id == patient_id,
            ).limit(1)
        ).scalars().first()
        if patient_alias and patient_alias.test:
            return patient_alias.test

    # 2. Check global alias (patient_id is NULL)
    global_alias = db.execute(
        select(TestAlias).where(
            TestAlias.alias_normalized == norm,
            TestAlias.patient_id.is_(None),
        ).limit(1)
    ).scalars().first()
    if global_alias and global_alias.test:
        return global_alias.test

    return None


def get_suggestions_for_raw_name(
    db: Session, raw_test_name: str, limit: int = 3
) -> List[Dict[str, Any]]:
    """Generate top fuzzy match suggestions for an unmatched test name.
    
    Suggestions are calculated purely deterministically via difflib.SequenceMatcher.
    """
    norm_query = normalize_test_name(raw_test_name)
    if not norm_query:
        return []

    # Safety checks for clinical specifiers
    query_is_direct = "direct" in norm_query or "conjugated" in norm_query
    query_is_total = "total" in norm_query or "tbil" in norm_query
    query_is_free = "free" in norm_query

    # Load all canonical tests and aliases
    tests = list(db.execute(select(Test)).scalars().all())
    aliases = list(db.execute(select(TestAlias)).scalars().all())

    best_scores: Dict[str, Tuple[float, Test]] = {}

    # Score against canonical names
    for t in tests:
        norm_t = normalize_test_name(t.canonical_name)
        # Apply safety rule: never suggest direct for total or vice versa
        if query_is_direct and "total" in norm_t:
            continue
        if query_is_total and "direct" in norm_t:
            continue
        if query_is_free and "total" in norm_t:
            continue

        ratio = difflib.SequenceMatcher(None, norm_query, norm_t).ratio()
        if ratio >= 0.55:
            best_scores[t.id] = (ratio, t)

    # Score against aliases
    for a in aliases:
        norm_a = a.alias_normalized
        if query_is_direct and "total" in norm_a:
            continue
        if query_is_total and "direct" in norm_a:
            continue
        if query_is_free and "total" in norm_a:
            continue

        ratio = difflib.SequenceMatcher(None, norm_query, norm_a).ratio()
        if ratio >= 0.55:
            current = best_scores.get(a.test_id)
            if current is None or ratio > current[0]:
                best_scores[a.test_id] = (ratio, a.test)

    # Sort descending by score
    sorted_items = sorted(best_scores.values(), key=lambda x: x[0], reverse=True)[:limit]

    return [
        {
            "test_id": item[1].id,
            "canonical_name": item[1].canonical_name,
            "category": item[1].category,
            "preferred_unit": item[1].preferred_unit,
            "similarity_score": round(item[0] * 100),
        }
        for item in sorted_items
    ]


def get_unmatched_tests_for_patient(db: Session, patient_id: str) -> List[Dict[str, Any]]:
    """Retrieve all distinct unmatched test names in a patient workspace with suggestions."""
    stmt = (
        select(ExtractedResult, Report)
        .join(Report, ExtractedResult.report_id == Report.id)
        .where(
            Report.patient_id == patient_id,
            ExtractedResult.test_id.is_(None),
            ExtractedResult.is_deleted == False,
        )
        .order_by(ExtractedResult.created_at.desc())
    )
    rows = db.execute(stmt).all()

    # Group by normalized test name
    grouped: Dict[str, Dict[str, Any]] = {}

    for res, report in rows:
        raw_name = res.effective_test_name
        norm = normalize_test_name(raw_name)
        if not norm:
            continue

        if norm not in grouped:
            grouped[norm] = {
                "raw_test_name": raw_name,
                "normalized_name": norm,
                "occurrence_count": 0,
                "reports_map": {},
                "observed_units": set(),
            }

        entry = grouped[norm]
        entry["occurrence_count"] += 1

        if res.effective_unit:
            entry["observed_units"].add(res.effective_unit)

        if report.id not in entry["reports_map"]:
            entry["reports_map"][report.id] = {
                "report_id": report.id,
                "filename": report.original_filename,
                "date": report.report_date,
            }

    result_items: List[Dict[str, Any]] = []

    for norm, g in grouped.items():
        suggestions = get_suggestions_for_raw_name(db, g["raw_test_name"])
        result_items.append(
            {
                "raw_test_name": g["raw_test_name"],
                "normalized_name": norm,
                "occurrence_count": g["occurrence_count"],
                "reports": list(g["reports_map"].values()),
                "observed_units": sorted(list(g["observed_units"])),
                "suggestions": suggestions,
            }
        )

    # Sort by highest occurrence count first
    result_items.sort(key=lambda x: x["occurrence_count"], reverse=True)
    return result_items


def check_unit_mismatches_for_patient(db: Session, patient_id: str) -> List[Dict[str, Any]]:
    """Find canonical tests in a patient workspace that exhibit unit discrepancies across reports.
    
    Section 9.3: Different units for the same canonical test produce a warning, with no conversion.
    """
    stmt = (
        select(ExtractedResult, Test, Report)
        .join(Test, ExtractedResult.test_id == Test.id)
        .join(Report, ExtractedResult.report_id == Report.id)
        .where(
            Report.patient_id == patient_id,
            ExtractedResult.test_id.is_not(None),
            ExtractedResult.is_deleted == False,
        )
    )
    rows = db.execute(stmt).all()

    test_units: Dict[str, Dict[str, Any]] = {}

    for res, test, report in rows:
        unit = res.effective_unit
        if not unit:
            continue

        if test.id not in test_units:
            test_units[test.id] = {
                "test": test,
                "units": set(),
                "reports": set(),
            }

        test_units[test.id]["units"].add(unit)
        test_units[test.id]["reports"].add(report.id)

    mismatches: List[Dict[str, Any]] = []

    for test_id, data in test_units.items():
        test: Test = data["test"]
        units = data["units"]
        # Case-insensitive / whitespace stripped comparison
        clean_units = {u.strip().lower() for u in units}

        is_mismatch = False
        message = ""

        # Mismatch if 2 or more distinct units are observed
        if len(clean_units) > 1:
            is_mismatch = True
            message = (
                f"Conflicting measurement units observed across reports: "
                f"{', '.join(sorted(units))}. Values are displayed as reported without auto-conversion."
            )
        # Or if observed unit differs from canonical preferred_unit
        elif test.preferred_unit and test.preferred_unit.strip().lower() not in clean_units:
            is_mismatch = True
            message = (
                f"Observed unit '{list(units)[0]}' differs from canonical preferred unit "
                f"'{test.preferred_unit}'."
            )

        if is_mismatch:
            mismatches.append(
                {
                    "test_id": test.id,
                    "canonical_name": test.canonical_name,
                    "preferred_unit": test.preferred_unit,
                    "observed_units": sorted(list(units)),
                    "affected_reports_count": len(data["reports"]),
                    "message": message,
                }
            )

    mismatches.sort(key=lambda x: x["canonical_name"])
    return mismatches


def apply_alias_to_results(
    db: Session,
    raw_test_name: str,
    test_id: str,
    patient_id: Optional[str] = None,
) -> int:
    """Apply a newly linked test_id to all matching ExtractedResults."""
    norm = normalize_test_name(raw_test_name)

    query = (
        select(ExtractedResult)
        .join(Report, ExtractedResult.report_id == Report.id)
        .where(ExtractedResult.is_deleted == False)
    )

    if patient_id:
        query = query.where(Report.patient_id == patient_id)

    results = list(db.execute(query).scalars().all())
    count = 0

    for r in results:
        if normalize_test_name(r.effective_test_name) == norm:
            r.test_id = test_id
            count += 1

    db.commit()
    return count
