"""Pydantic schemas for the live medical dashboard metrics."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class DashboardPatientItem(BaseModel):
    id: str
    display_name: str
    report_count: int
    latest_report_date: Optional[str] = None
    created_at: datetime


class DashboardReportItem(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    original_filename: str
    status: str
    report_date: Optional[str] = None
    created_at: datetime


class DashboardActivityItem(BaseModel):
    id: str
    event_type: str
    details: Optional[str] = None
    created_at: datetime


class DashboardSummaryResponse(BaseModel):
    total_patients: int
    total_reports: int
    reports_awaiting_review: int
    processing_failures: int
    recent_patients: List[DashboardPatientItem]
    recent_reports: List[DashboardReportItem]
    recent_activities: List[DashboardActivityItem]
