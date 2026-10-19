"""Pydantic schemas for AuditEvent resource (Milestone 12).

Strict privacy guarantee: Only non-clinical lifecycle metadata.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class AuditEventResponse(BaseModel):
    """Shape of an audit event returned to client."""
    id: str
    patient_id: Optional[str] = None
    event_type: str
    entity_id: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditEventListResponse(BaseModel):
    """Paginated list of audit events."""
    items: List[AuditEventResponse]
    total: int
