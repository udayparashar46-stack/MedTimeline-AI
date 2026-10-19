"""Mapping router — resolve unmatched test names and manage alias mappings.

Endpoints:
  GET    /patients/{id}/mapping/unmatched        — List unmatched raw test names with suggestions
  POST   /patients/{id}/mapping                  — Map a raw test name to a canonical test
  DELETE /patients/{id}/mapping/{alias_id}       — Remove an alias mapping
  GET    /patients/{id}/mapping/unit-mismatches  — List tests with unit discrepancies across reports
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.user import User
from app.repositories import test_repo
from app.schemas.test import (
    UnmatchedTestsResponse,
    UnmatchedTestItem,
    TestSuggestion,
    MappingCreate,
    MappingResponse,
    TestAliasResponse,
    UnitMismatchResponse,
    UnitMismatchItem,
)
from app.services.normalization.matcher import (
    get_unmatched_tests_for_patient,
    check_unit_mismatches_for_patient,
)
from app.api.deps import get_current_user, verify_patient_access

router = APIRouter(tags=["mapping"])


@router.get(
    "/patients/{patient_id}/mapping/unmatched",
    response_model=UnmatchedTestsResponse,
)
def get_unmatched_tests(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnmatchedTestsResponse:
    """Retrieve all unmatched test names in a patient workspace with fuzzy match suggestions."""
    verify_patient_access(patient_id, db=db, current_user=current_user)

    items = get_unmatched_tests_for_patient(db, patient_id)
    formatted = [
        UnmatchedTestItem(
            raw_test_name=item["raw_test_name"],
            normalized_name=item["normalized_name"],
            occurrence_count=item["occurrence_count"],
            reports=item["reports"],
            observed_units=item["observed_units"],
            suggestions=[
                TestSuggestion(**s) for s in item["suggestions"]
            ],
        )
        for item in items
    ]

    return UnmatchedTestsResponse(
        patient_id=patient_id,
        total_unmatched=len(formatted),
        items=formatted,
    )


@router.post(
    "/patients/{patient_id}/mapping",
    response_model=MappingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_mapping(
    patient_id: str,
    data: MappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MappingResponse:
    """Link a raw test name to a canonical test, updating all matching ExtractedResults."""
    verify_patient_access(patient_id, db=db, current_user=current_user)

    test = test_repo.get_canonical_test(db, data.test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Canonical test not found.")

    alias_obj, updated_count = test_repo.create_test_alias(
        db=db,
        test_id=test.id,
        raw_alias=data.raw_test_name,
        is_global=data.is_global,
        patient_id=patient_id,
    )

    return MappingResponse(
        alias=TestAliasResponse.model_validate(alias_obj),
        updated_results_count=updated_count,
    )


@router.delete(
    "/patients/{patient_id}/mapping/{alias_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_mapping(
    patient_id: str,
    alias_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a user-defined alias mapping and unlink affected ExtractedResults."""
    verify_patient_access(patient_id, db=db, current_user=current_user)

    deleted = test_repo.delete_test_alias(db, alias_id, patient_id=patient_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mapping alias not found.")

    return None


@router.get(
    "/patients/{patient_id}/mapping/unit-mismatches",
    response_model=UnitMismatchResponse,
)
def get_unit_mismatches(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnitMismatchResponse:
    """Check for unit discrepancies across reports for canonical tests in this patient workspace."""
    verify_patient_access(patient_id, db=db, current_user=current_user)

    mismatches = check_unit_mismatches_for_patient(db, patient_id)
    return UnitMismatchResponse(
        patient_id=patient_id,
        mismatches_count=len(mismatches),
        items=[UnitMismatchItem(**m) for m in mismatches],
    )
