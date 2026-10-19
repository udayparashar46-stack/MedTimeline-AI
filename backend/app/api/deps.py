"""FastAPI dependencies for authentication, active user checks, and patient workspace isolation."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.user import User
from app.db.models.patient import Patient
from app.db.models.report import Report
from app.db.models.extracted_result import ExtractedResult
from app.core.security import decode_access_token
from app.repositories import user_repo, patient_repo

# auto_error=False allows testing custom 401 messages and headers
http_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    auth: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Validate Bearer JWT access token and return the active User."""
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(auth.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]
    user = user_repo.get_user(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account.",
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Verify user is active."""
    return current_user


def verify_patient_access(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Patient:
    """Retrieve patient workspace and enforce per-user tenant isolation.

    Per blueprint Section 10.1 & conventions:
    Returns 404 (never 403) for other users' workspaces to prevent workspace ID enumeration.
    """
    patient = patient_repo.get_patient(db, patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient workspace not found.",
        )

    # Check tenant isolation
    if patient.owner_id and patient.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient workspace not found.",
        )

    # Adopt legacy or newly seeded unowned workspaces
    if not patient.owner_id:
        patient.owner_id = current_user.id
        db.commit()
        db.refresh(patient)

    return patient


def verify_report_access(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Report:
    """Ensure report exists and belongs to a workspace owned by current_user."""
    report = db.query(Report).filter(Report.id == report_id, Report.is_deleted == False).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )

    # Verify workspace isolation
    verify_patient_access(report.patient_id, db=db, current_user=current_user)
    return report


def verify_result_access(
    result_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExtractedResult:
    """Ensure result row exists and belongs to a workspace owned by current_user."""
    result = db.query(ExtractedResult).filter(ExtractedResult.id == result_id).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result not found.",
        )

    # Verify report & patient isolation
    verify_report_access(result.report_id, db=db, current_user=current_user)
    return result
