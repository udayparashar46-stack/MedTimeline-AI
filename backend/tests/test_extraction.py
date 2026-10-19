"""Unit and integration tests for Milestone 4 (Text Extraction & Date Detection).

Tests:
1. Text-layer detection and scanned PDF identification
2. Multiple date formats: ISO, DD/MM/YYYY, DD-Mon-YYYY, Month DD, YYYY
3. Precedence: Specimen/collection date strictly preferred over print/reported date
4. Ambiguous dates: conflicting dates and day-first vs month-first numeric dates
5. API endpoints: automatic extraction on upload, raw text view, and date confirmation
"""

import tempfile
import fitz
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.services.storage import storage_service
from app.services.extraction import (
    detect_text_layer,
    detect_report_date,
    extract_report_from_bytes,
)


def create_pdf_with_text(text: str) -> bytes:
    """Generate a clean synthetic PDF with exact text lines."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text, fontsize=11)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_scanned_image_pdf() -> bytes:
    """Generate a synthetic PDF with an image only and no text layer."""
    doc = fitz.open()
    page = doc.new_page(width=300, height=300)
    # Insert a blank or minimal pixmap image with zero text
    pix = fitz.Pixmap(fitz.csRGB, (0, 0, 100, 100), 1)
    pix.clear_with(255)
    page.insert_image(fitz.Rect(50, 50, 150, 150), pixmap=pix)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.fixture()
def client():
    temp_dir = tempfile.TemporaryDirectory()
    orig_upload_dir = storage_service.upload_dir
    storage_service.upload_dir = storage_service.upload_dir.__class__(temp_dir.name)

    engine_mem = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine_mem)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_mem)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)

    storage_service.upload_dir = orig_upload_dir
    temp_dir.cleanup()


class TestTextLayerDetection:
    def test_text_pdf_detected_correctly(self) -> None:
        content = create_pdf_with_text(
            "METABOLIC PANEL\nPatient: John Doe\nCollection Date: 18 Oct 2026\nGlucose: 95 mg/dL"
        )
        res = detect_text_layer(content)
        assert res.has_text_layer is True
        assert res.is_scanned is False
        assert res.total_characters > 40
        assert "METABOLIC PANEL" in res.full_text

    def test_scanned_image_pdf_flagged_as_no_text(self) -> None:
        content = create_scanned_image_pdf()
        res = detect_text_layer(content)
        assert res.has_text_layer is False
        assert res.is_scanned is True
        assert res.warning_message is not None
        assert "scanned or image-only" in res.warning_message.lower()


class TestDateDetectionFormats:
    def test_iso_format(self) -> None:
        res = detect_report_date("Collection Date: 2026-10-18\nHemoglobin: 14.2")
        assert res.detected_date == "2026-10-18"
        assert res.is_ambiguous is False

    def test_dd_mm_yyyy_slash(self) -> None:
        res = detect_report_date("Specimen Date: 25/12/2025\nTest result: Normal")
        assert res.detected_date == "2025-12-25"
        assert res.is_ambiguous is False

    def test_dd_mm_yyyy_dash(self) -> None:
        res = detect_report_date("Sampled On: 19-08-2026\nPlatelet count: 250")
        assert res.detected_date == "2026-08-19"
        assert res.is_ambiguous is False

    def test_dd_month_name_year(self) -> None:
        res = detect_report_date("Draw Date: 14 October 2026\nSerum Creatinine: 0.9")
        assert res.detected_date == "2026-10-14"
        assert res.is_ambiguous is False

    def test_us_month_name_format(self) -> None:
        res = detect_report_date("Collected: Oct 18, 2026\nTotal Cholesterol: 188")
        assert res.detected_date == "2026-10-18"
        assert res.is_ambiguous is False


class TestDatePriorityAndAmbiguity:
    def test_prefers_collection_date_over_print_date(self) -> None:
        """Rule: Specimen collection date must be preferred over print date."""
        sample_text = (
            "LabCorp Diagnostics\n"
            "Printed On: 24 Oct 2026\n"
            "Report Generated: 22 Oct 2026\n"
            "Specimen Collected: 18 Oct 2026\n"
            "Test: Complete Blood Count\n"
        )
        res = detect_report_date(sample_text)
        assert res.detected_date == "2026-10-18"
        assert res.confidence == "high"
        assert "Collected" in res.source_text

    def test_multiple_conflicting_collection_dates_flagged_ambiguous(self) -> None:
        """When two different collection dates exist in the same report, flag as ambiguous."""
        sample_text = (
            "Panel 1 Collected: 14 Oct 2026\n"
            "Panel 2 Sample Date: 18 Oct 2026\n"
        )
        res = detect_report_date(sample_text)
        assert res.is_ambiguous is True
        assert len(res.alternatives) == 2
        dates = {a.date_iso for a in res.alternatives}
        assert dates == {"2026-10-14", "2026-10-18"}

    def test_ambiguous_numeric_date_flags_alternatives(self) -> None:
        """03/04/2026 could be 3 April or 4 March; defaults to day-first but records ambiguity."""
        sample_text = "Specimen Collected: 03/04/2026\n"
        res = detect_report_date(sample_text)
        assert res.is_ambiguous is True
        # Day-first default is April 3 (2026-04-03)
        assert res.detected_date == "2026-04-03"
        alt_dates = {a.date_iso for a in res.alternatives}
        assert "2026-04-03" in alt_dates
        assert "2026-03-04" in alt_dates


class TestExtractionAPIIntegration:
    def test_upload_extracts_date_automatically(self, client: TestClient) -> None:
        patient_resp = client.post("/api/v1/patients", json={"display_name": "Test Patient"})
        patient_id = patient_resp.json()["id"]

        pdf_bytes = create_pdf_with_text(
            "METABOLIC PANEL\n"
            "Patient: PT-1042\n"
            "Printed: 22 Oct 2026\n"
            "Sample Collected: 18 Oct 2026\n"
            "Glucose: 95 mg/dL\n"
        )

        upload_resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("panel.pdf", pdf_bytes, "application/pdf"))],
        )
        assert upload_resp.status_code == 201
        report = upload_resp.json()["items"][0]["report"]

        assert report["has_text_layer"] is True
        assert report["report_date"] == "2026-10-18"
        assert "Sample Collected" in report["report_date_source_text"]
        assert report["is_date_ambiguous"] is False

    def test_upload_scanned_pdf_flags_no_text_layer(self, client: TestClient) -> None:
        patient_resp = client.post("/api/v1/patients", json={"display_name": "Scanned Patient"})
        patient_id = patient_resp.json()["id"]

        scanned_bytes = create_scanned_image_pdf()
        upload_resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("scan.pdf", scanned_bytes, "application/pdf"))],
        )
        assert upload_resp.status_code == 201
        report = upload_resp.json()["items"][0]["report"]

        assert report["has_text_layer"] is False
        assert report["report_date"] is None
        assert "scanned or image-only" in report["failure_reason"].lower()

    def test_get_raw_text_debugging_view(self, client: TestClient) -> None:
        patient_resp = client.post("/api/v1/patients", json={"display_name": "Debug Patient"})
        patient_id = patient_resp.json()["id"]

        pdf_bytes = create_pdf_with_text("SECRET_RAW_TOKEN: Hematology Summary\nDate: 2026-10-18")
        upload_resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("cbc.pdf", pdf_bytes, "application/pdf"))],
        )
        report_id = upload_resp.json()["items"][0]["report"]["id"]

        extract_resp = client.get(f"/api/v1/reports/{report_id}/extract")
        assert extract_resp.status_code == 200
        data = extract_resp.json()
        assert data["report_id"] == report_id
        assert data["has_text_layer"] is True
        assert "SECRET_RAW_TOKEN" in data["extracted_text"]

    def test_user_can_confirm_or_update_ambiguous_date(self, client: TestClient) -> None:
        patient_resp = client.post("/api/v1/patients", json={"display_name": "Confirm Patient"})
        patient_id = patient_resp.json()["id"]

        pdf_bytes = create_pdf_with_text(
            "CLINICAL LABORATORY REPORT - BIOCHEMISTRY PANEL\n"
            "Collected: 03/04/2026\n"
            "Patient Name: Synthetic Test Patient\n"
        )
        upload_resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("date_test.pdf", pdf_bytes, "application/pdf"))],
        )
        report = upload_resp.json()["items"][0]["report"]
        assert report["is_date_ambiguous"] is True

        # User confirms the date as 2026-03-04 (March 4)
        patch_resp = client.patch(
            f"/api/v1/reports/{report['id']}",
            json={"report_date": "2026-03-04", "report_date_confirmed": True},
        )
        assert patch_resp.status_code == 200
        updated = patch_resp.json()
        assert updated["report_date"] == "2026-03-04"
        assert updated["report_date_confirmed"] is True
        assert updated["is_date_ambiguous"] is False
