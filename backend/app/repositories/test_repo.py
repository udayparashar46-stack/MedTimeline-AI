"""Test repository — database operations for Test and TestAlias models."""

from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.models.test import Test
from app.db.models.test_alias import TestAlias
from app.db.models.extracted_result import ExtractedResult
from app.db.models.report import Report
from app.schemas.test import CanonicalTestCreate
from app.services.normalization.normalizer import normalize_test_name
from app.services.normalization.matcher import apply_alias_to_results


def list_canonical_tests(
    db: Session,
    search: Optional[str] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> Tuple[List[Test], int]:
    """List canonical tests with optional search and category filters."""
    query = select(Test)

    if search:
        term = f"%{search.lower()}%"
        query = query.where(func.lower(Test.canonical_name).like(term))

    if category:
        query = query.where(Test.category == category)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()

    tests = list(
        db.execute(
            query.order_by(Test.category.asc(), Test.canonical_name.asc())
            .offset(skip)
            .limit(limit)
        )
        .scalars()
        .all()
    )

    return tests, total


def get_canonical_test(db: Session, test_id: str) -> Optional[Test]:
    """Retrieve a single canonical test by ID."""
    return db.execute(select(Test).where(Test.id == test_id)).scalar_one_or_none()


def get_canonical_test_by_name(db: Session, name: str) -> Optional[Test]:
    """Retrieve a canonical test by exact name (case-insensitive)."""
    return db.execute(
        select(Test).where(func.lower(Test.canonical_name) == name.strip().lower())
    ).scalar_one_or_none()


def create_canonical_test(db: Session, data: CanonicalTestCreate) -> Test:
    """Create a new user-defined canonical test and self-alias."""
    test = Test(
        canonical_name=data.canonical_name.strip(),
        category=data.category.strip() if data.category else None,
        preferred_unit=data.preferred_unit.strip() if data.preferred_unit else None,
        is_seeded=False,
    )
    db.add(test)
    db.commit()
    db.refresh(test)

    # Automatically add canonical name as first alias
    norm = normalize_test_name(test.canonical_name)
    alias = TestAlias(
        test_id=test.id,
        alias_normalized=norm,
        raw_alias=test.canonical_name,
        source="user",
        patient_id=None,
    )
    db.add(alias)
    db.commit()
    db.refresh(test)
    return test


def create_test_alias(
    db: Session,
    test_id: str,
    raw_alias: str,
    is_global: bool = False,
    patient_id: Optional[str] = None,
) -> Tuple[TestAlias, int]:
    """Create an alias mapping and apply test_id to all matching ExtractedResults.
    
    Returns (created_alias, updated_results_count).
    """
    norm = normalize_test_name(raw_alias)
    effective_patient_id = None if is_global else patient_id

    # Check if duplicate alias already exists
    existing_alias = db.execute(
        select(TestAlias).where(
            TestAlias.test_id == test_id,
            TestAlias.alias_normalized == norm,
            TestAlias.patient_id == effective_patient_id,
        )
    ).scalar_one_or_none()

    if existing_alias:
        alias_obj = existing_alias
    else:
        alias_obj = TestAlias(
            test_id=test_id,
            alias_normalized=norm,
            raw_alias=raw_alias.strip(),
            source="user",
            patient_id=effective_patient_id,
        )
        db.add(alias_obj)
        db.commit()
        db.refresh(alias_obj)

    # Apply to existing results
    updated_count = apply_alias_to_results(
        db=db,
        raw_test_name=raw_alias,
        test_id=test_id,
        patient_id=effective_patient_id,
    )

    return alias_obj, updated_count


def delete_test_alias(db: Session, alias_id: str, patient_id: Optional[str] = None) -> bool:
    """Delete a user-defined alias and unlink results that used this specific mapping."""
    stmt = select(TestAlias).where(TestAlias.id == alias_id)
    if patient_id:
        stmt = stmt.where(TestAlias.patient_id == patient_id)

    alias = db.execute(stmt).scalar_one_or_none()
    if not alias:
        return False

    norm = alias.alias_normalized
    test_id = alias.test_id

    # Unlink ExtractedResults matching this alias
    query = (
        select(ExtractedResult)
        .join(Report, ExtractedResult.report_id == Report.id)
        .where(ExtractedResult.test_id == test_id)
    )
    if alias.patient_id:
        query = query.where(Report.patient_id == alias.patient_id)

    results = list(db.execute(query).scalars().all())
    for r in results:
        if normalize_test_name(r.effective_test_name) == norm:
            r.test_id = None

    db.delete(alias)
    db.commit()
    return True
