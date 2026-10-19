"""Canonical tests router — manage canonical lab test definitions.

Endpoints:
  GET  /tests       — List canonical tests (with search and category filters)
  POST /tests       — Create a new user-defined canonical test
  GET  /tests/{id}  — Retrieve a canonical test with all its aliases
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories import test_repo
from app.schemas.test import (
    CanonicalTestResponse,
    CanonicalTestDetailResponse,
    CanonicalTestCreate,
    TestAliasResponse,
)

router = APIRouter(prefix="/tests", tags=["tests"])


@router.get("", response_model=List[CanonicalTestResponse])
def list_canonical_tests(
    search: Optional[str] = Query(None, description="Search canonical test name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> List[CanonicalTestResponse]:
    """List canonical tests in the catalog."""
    tests, _ = test_repo.list_canonical_tests(
        db=db, search=search, category=category, skip=skip, limit=limit
    )
    return [
        CanonicalTestResponse(
            id=t.id,
            canonical_name=t.canonical_name,
            category=t.category,
            preferred_unit=t.preferred_unit,
            is_seeded=t.is_seeded,
            aliases_count=len(t.aliases),
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tests
    ]


@router.post("", response_model=CanonicalTestResponse, status_code=status.HTTP_201_CREATED)
def create_canonical_test(
    data: CanonicalTestCreate,
    db: Session = Depends(get_db),
) -> CanonicalTestResponse:
    """Create a new user-defined canonical test."""
    existing = test_repo.get_canonical_test_by_name(db, data.canonical_name)
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A canonical test with name '{data.canonical_name}' already exists.",
        )

    test = test_repo.create_canonical_test(db, data)
    return CanonicalTestResponse(
        id=test.id,
        canonical_name=test.canonical_name,
        category=test.category,
        preferred_unit=test.preferred_unit,
        is_seeded=test.is_seeded,
        aliases_count=len(test.aliases),
        created_at=test.created_at,
        updated_at=test.updated_at,
    )


@router.get("/{test_id}", response_model=CanonicalTestDetailResponse)
def get_canonical_test(
    test_id: str,
    db: Session = Depends(get_db),
) -> CanonicalTestDetailResponse:
    """Retrieve details and all aliases for a single canonical test."""
    test = test_repo.get_canonical_test(db, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Canonical test not found.")

    return CanonicalTestDetailResponse(
        id=test.id,
        canonical_name=test.canonical_name,
        category=test.category,
        preferred_unit=test.preferred_unit,
        is_seeded=test.is_seeded,
        aliases_count=len(test.aliases),
        aliases=[TestAliasResponse.model_validate(a) for a in test.aliases],
        created_at=test.created_at,
        updated_at=test.updated_at,
    )
