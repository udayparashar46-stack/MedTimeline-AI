"""Health check API router."""

from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Perform a health check")
def health_check() -> dict[str, str]:
    """Liveness check returning OK status."""
    return {"status": "ok"}
