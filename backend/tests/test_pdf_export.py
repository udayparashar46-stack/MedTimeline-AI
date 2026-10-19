"""Unit and integration tests for Milestone 10 (PDF Export).

Acceptance criteria tested:
- Landscape print-friendly PDF generation (A4 landscape: 842 x 595 pt).
- Starts with valid PDF magic bytes (%PDF-).
- Mandatory medical disclaimer present on all pages:
  "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
- Patient display label and chronological date context included in header.
- Repeated table headers across multiple pages when row pagination occurs.
- Wide table column chunking handles many reports without clipping.
- Blank cells for missing test results (zero invented numbers or interpolations).
- Same-date reports separated into distinct columns (FR5).
- Review-status filtering (include_unreviewed=False excludes unreviewed; include_unreviewed=True includes with marker).
- Cell highlights for out-of-range flags (H/L).
- Empty workspace returns a clean PDF with empty state notice and disclaimer.
- Non-existent patient returns 404.
"""

import pytest
import fitz
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.db.models.patient import Patient
from app.db.models.report import Report
from app.db.models.test import Test
from app.db.models.extracted_result import ExtractedResult
from app.db.models.result_edit import ResultEdit


@pytest.fixture()
def client():
    """In-memory SQLite test database fixture using StaticPool."""
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
        yield c, TestingSession
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)


def seed_pdf_test_data(TestingSession):
    """Seed patient, tests, reports, and extracted results for PDF tests."""
    with TestingSession() as db:
        patient = Patient(
            id="patient-pdf-1",
            display_name="Eleanor Vance",
            date_of_birth="1975-08-20",
            sex="female",
        )
        db.add(patient)

        test_hgb = Test(
            id="test-pdf-hgb",
            canonical_name="Hemoglobin",
            category="Complete Blood Count",
            preferred_unit="g/dL",
            is_seeded=True,
        )
        test_wbc = Test(
            id="test-pdf-wbc",
            canonical_name="White Blood Cell Count",
            category="Complete Blood Count",
            preferred_unit="10^3/uL",
            is_seeded=True,
        )
        test_plt = Test(
            id="test-pdf-plt",
            canonical_name="Platelet Count",
            category="Complete Blood Count",
            preferred_unit="10^3/uL",
            is_seeded=True,
        )
        test_creat = Test(
            id="test-pdf-creat",
            canonical_name="Serum Creatinine",
            category="Kidney Function Tests",
            preferred_unit="mg/dL",
            is_seeded=True,
        )
        test_alt = Test(
            id="test-pdf-alt",
            canonical_name="Alanine Aminotransferase (ALT)",
            category="Liver Function Tests",
            preferred_unit="U/L",
            is_seeded=True,
        )
        db.add_all([test_hgb, test_wbc, test_plt, test_creat, test_alt])

        # Reports: Report 1 (2026-01-10), Report 2 (2026-03-15), Report 3 (2026-03-15 same day second lab)
        rep1 = Report(
            id="rep-pdf-1",
            patient_id="patient-pdf-1",
            original_filename="lab_jan2026.pdf",
            file_path="/tmp/fake1.pdf",
            file_sha256="sha111",
            page_count=2,
            status="reviewed",
            report_date="2026-01-10",
            report_date_confirmed=True,
            lab_name="City Central Lab",
        )
        rep2 = Report(
            id="rep-pdf-2",
            patient_id="patient-pdf-1",
            original_filename="lab_mar2026_quest.pdf",
            file_path="/tmp/fake2.pdf",
            file_sha256="sha222",
            page_count=1,
            status="reviewed",
            report_date="2026-03-15",
            report_date_confirmed=True,
            lab_name="Quest Diagnostics",
        )
        rep3 = Report(
            id="rep-pdf-3",
            patient_id="patient-pdf-1",
            original_filename="lab_mar2026_hospital.pdf",
            file_path="/tmp/fake3.pdf",
            file_sha256="sha333",
            page_count=1,
            status="reviewed",
            report_date="2026-03-15",
            report_date_confirmed=True,
            lab_name="Memorial Hospital",
        )
        db.add_all([rep1, rep2, rep3])

        # Results
        # Rep 1: HGB=11.2 (L), Creatinine=0.9
        res1 = ExtractedResult(
            id="res-pdf-1",
            report_id="rep-pdf-1",
            page_number=1,
            row_order=1,
            raw_test_name="Hemoglobin",
            raw_value_text="11.2",
            raw_unit="g/dL",
            raw_reference_text="12.0 - 15.5",
            printed_flag="L",
            source_snippet="Hemoglobin 11.2 L g/dL 12.0-15.5",
            parse_confidence="high",
            test_id="test-pdf-hgb",
            review_status="confirmed",
        )
        res2 = ExtractedResult(
            id="res-pdf-2",
            report_id="rep-pdf-1",
            page_number=1,
            row_order=2,
            raw_test_name="Creatinine",
            raw_value_text="0.9",
            raw_unit="mg/dL",
            raw_reference_text="0.5 - 1.2",
            printed_flag=None,
            source_snippet="Creatinine 0.9 mg/dL 0.5-1.2",
            parse_confidence="high",
            test_id="test-pdf-creat",
            review_status="confirmed",
        )
        # Rep 2: HGB=13.5 (Normal), ALT=55 (H)
        res3 = ExtractedResult(
            id="res-pdf-3",
            report_id="rep-pdf-2",
            page_number=1,
            row_order=1,
            raw_test_name="Hb",
            raw_value_text="13.5",
            raw_unit="g/dL",
            raw_reference_text="12.0 - 15.5",
            printed_flag=None,
            source_snippet="Hb 13.5 g/dL 12.0-15.5",
            parse_confidence="high",
            test_id="test-pdf-hgb",
            review_status="confirmed",
        )
        res4 = ExtractedResult(
            id="res-pdf-4",
            report_id="rep-pdf-2",
            page_number=1,
            row_order=2,
            raw_test_name="ALT (SGPT)",
            raw_value_text="55",
            raw_unit="U/L",
            raw_reference_text="7 - 35",
            printed_flag="H",
            source_snippet="ALT 55 H U/L 7-35",
            parse_confidence="high",
            test_id="test-pdf-alt",
            review_status="confirmed",
        )
        # Rep 3: Platelets=250 (confirmed), WBC=4.5 (unreviewed draft)
        res5 = ExtractedResult(
            id="res-pdf-5",
            report_id="rep-pdf-3",
            page_number=1,
            row_order=1,
            raw_test_name="Platelets",
            raw_value_text="250",
            raw_unit="10^3/uL",
            raw_reference_text="150 - 450",
            printed_flag=None,
            source_snippet="Platelets 250 10^3/uL 150-450",
            parse_confidence="high",
            test_id="test-pdf-plt",
            review_status="confirmed",
        )
        res6 = ExtractedResult(
            id="res-pdf-6",
            report_id="rep-pdf-3",
            page_number=1,
            row_order=2,
            raw_test_name="WBC",
            raw_value_text="4.5",
            raw_unit="10^3/uL",
            raw_reference_text="4.0 - 11.0",
            printed_flag=None,
            source_snippet="WBC 4.5 10^3/uL 4.0-11.0",
            parse_confidence="high",
            test_id="test-pdf-wbc",
            review_status="unreviewed",
        )
        db.add_all([res1, res2, res3, res4, res5, res6])
        db.commit()


class TestPdfExport:
    def test_export_pdf_success_headers_and_bytes(self, client):
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert "attachment; filename=" in resp.headers["content-disposition"]
        assert resp.headers["content-disposition"].endswith('.pdf"')

        # Verify PDF magic bytes
        pdf_bytes = resp.content
        assert pdf_bytes.startswith(b"%PDF-")

    def test_pdf_dimensions_and_orientation(self, client):
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc = fitz.open(stream=resp.content, filetype="pdf")

        # Document must have at least 1 page
        assert doc.page_count >= 1

        # Check orientation is landscape (width > height, A4 landscape: ~842 x 595)
        for page in doc:
            rect = page.rect
            assert rect.width > rect.height
            assert pytest.approx(rect.width, abs=2) == 842.0
            assert pytest.approx(rect.height, abs=2) == 595.0

    def test_disclaimer_presence_on_all_pages(self, client):
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc = fitz.open(stream=resp.content, filetype="pdf")

        mandatory_disclaimer = (
            "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
        )

        for page_idx in range(doc.page_count):
            page_text = doc[page_idx].get_text()
            assert mandatory_disclaimer in page_text, f"Missing disclaimer on page {page_idx + 1}"

    def test_patient_name_and_metadata_in_pdf(self, client):
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc = fitz.open(stream=resp.content, filetype="pdf")
        full_text = "".join(page.get_text() for page in doc)

        assert "Eleanor Vance" in full_text
        assert "MedTimeline AI" in full_text
        assert "Filter: Confirmed Results Only" in full_text
        assert "Page 1 of" in full_text

    def test_date_columns_and_same_date_reports_separation(self, client):
        """FR5: Reports on the same date (2026-03-15) must appear as separate columns."""
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc = fitz.open(stream=resp.content, filetype="pdf")
        full_text = "".join(page.get_text() for page in doc)

        assert "2026-01-10" in full_text
        assert "2026-03-15" in full_text
        # Both lab names should be present
        assert "Quest Diagnostics" in full_text or "Quest" in full_text
        assert "Memorial Hospital" in full_text or "Memorial" in full_text

    def test_values_and_out_of_range_flags(self, client):
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc = fitz.open(stream=resp.content, filetype="pdf")
        full_text = "".join(page.get_text() for page in doc)

        # 11.2 L (Low flag)
        assert "11.2 L" in full_text
        # 55 H (High flag)
        assert "55 H" in full_text
        # Normal 13.5
        assert "13.5" in full_text

    def test_unreviewed_filter_behavior(self, client):
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        # 1. Default: include_unreviewed=False (WBC=4.5 is unreviewed, should NOT appear)
        resp_confirmed = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc_confirmed = fitz.open(stream=resp_confirmed.content, filetype="pdf")
        text_confirmed = "".join(page.get_text() for page in doc_confirmed)
        assert "Confirmed Results Only" in text_confirmed
        assert "White Blood Cell Count" not in text_confirmed

        # 2. include_unreviewed=True (WBC=4.5 should appear with draft marker *)
        resp_all = c.get("/api/v1/patients/patient-pdf-1/export/pdf?include_unreviewed=true")
        doc_all = fitz.open(stream=resp_all.content, filetype="pdf")
        text_all = "".join(page.get_text() for page in doc_all)
        assert "Confirmed & Unreviewed Drafts" in text_all
        assert "White Blood Cell Count" in text_all
        assert "4.5*" in text_all

    def test_missing_values_remain_blank_cells(self, client):
        """Principle 1: Missing results are empty cells (never 0, N/A, or estimated values)."""
        c, TestingSession = client
        seed_pdf_test_data(TestingSession)

        resp = c.get("/api/v1/patients/patient-pdf-1/export/pdf")
        doc = fitz.open(stream=resp.content, filetype="pdf")
        full_text = "".join(page.get_text() for page in doc)

        # We did not record ALT for Report 1 or Report 3; text should not have invented numbers
        assert "0.0" not in full_text
        assert "interpolated" not in full_text.lower()
        assert "estimated" not in full_text.lower()

    def test_multi_page_tall_timeline_pagination(self, client):
        """A patient with 30+ tests should paginate vertically across multiple pages with repeated headers."""
        c, TestingSession = client
        with TestingSession() as db:
            patient = Patient(id="patient-tall", display_name="Tall Patient")
            db.add(patient)

            report = Report(
                id="rep-tall-1",
                patient_id="patient-tall",
                original_filename="large_panel.pdf",
                file_path="/tmp/large.pdf",
                file_sha256="sha-large",
                page_count=5,
                status="reviewed",
                report_date="2026-06-01",
                report_date_confirmed=True,
                lab_name="National Lab",
            )
            db.add(report)

            # Add 35 tests
            for i in range(1, 36):
                test = Test(
                    id=f"test-tall-{i}",
                    canonical_name=f"Clinical Test Analyte #{i:02d}",
                    category="Large Panel Profile" if i <= 20 else "Secondary Profile",
                    preferred_unit="mg/dL",
                    is_seeded=False,
                )
                db.add(test)
                res = ExtractedResult(
                    id=f"res-tall-{i}",
                    report_id="rep-tall-1",
                    page_number=1,
                    row_order=i,
                    raw_test_name=f"Clinical Test Analyte #{i:02d}",
                    raw_value_text=f"{i * 2.5:.1f}",
                    raw_unit="mg/dL",
                    raw_reference_text="1.0 - 50.0",
                    source_snippet=f"Analyte {i} {i*2.5} mg/dL",
                    parse_confidence="high",
                    test_id=f"test-tall-{i}",
                    review_status="confirmed",
                )
                db.add(res)
            db.commit()

        resp = c.get("/api/v1/patients/patient-tall/export/pdf")
        assert resp.status_code == 200
        doc = fitz.open(stream=resp.content, filetype="pdf")

        # Must have split across at least 2 pages
        assert doc.page_count >= 2

        # Verify repeated table header on both pages
        page1_text = doc[0].get_text()
        page2_text = doc[1].get_text()
        assert "Test / Analyte" in page1_text
        assert "Test / Analyte" in page2_text
        assert "2026-06-01" in page1_text
        assert "2026-06-01" in page2_text

        # Verify disclaimer on both pages
        disclaimer = "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
        assert disclaimer in page1_text
        assert disclaimer in page2_text

    def test_wide_timeline_column_chunking(self, client):
        """A patient with 8 reports should chunk horizontally so columns don't squish."""
        c, TestingSession = client
        with TestingSession() as db:
            patient = Patient(id="patient-wide", display_name="Wide Patient")
            db.add(patient)

            test = Test(
                id="test-wide-1",
                canonical_name="Glucose Fasting",
                category="Diabetes Panel",
                preferred_unit="mg/dL",
            )
            db.add(test)

            for i in range(1, 9):
                rep = Report(
                    id=f"rep-wide-{i}",
                    patient_id="patient-wide",
                    original_filename=f"glucose_report_{i}.pdf",
                    file_path=f"/tmp/wide_{i}.pdf",
                    file_sha256=f"sha-wide-{i}",
                    status="reviewed",
                    report_date=f"2026-0{i}-15" if i < 10 else f"2026-{i}-15",
                    report_date_confirmed=True,
                    lab_name=f"Lab #{i}",
                )
                db.add(rep)
                res = ExtractedResult(
                    id=f"res-wide-{i}",
                    report_id=f"rep-wide-{i}",
                    page_number=1,
                    row_order=1,
                    raw_test_name="Glucose",
                    raw_value_text=f"{90 + i}",
                    raw_unit="mg/dL",
                    source_snippet=f"Glucose {90+i} mg/dL",
                    test_id="test-wide-1",
                    review_status="confirmed",
                    parse_confidence="high",
                )
                db.add(res)
            db.commit()

        resp = c.get("/api/v1/patients/patient-wide/export/pdf")
        assert resp.status_code == 200
        doc = fitz.open(stream=resp.content, filetype="pdf")

        # 8 reports with 5 max per chunk -> 2 chunks (at least 2 pages)
        assert doc.page_count >= 2
        p1_text = doc[0].get_text()
        p2_text = doc[1].get_text()
        assert "Dates segment 1 of 2" in p1_text
        assert "Dates segment 2 of 2" in p2_text

    def test_empty_workspace_pdf_export(self, client):
        """Empty patient workspace should return clean 1-page PDF with empty notice and disclaimer."""
        c, TestingSession = client
        with TestingSession() as db:
            patient = Patient(id="patient-empty", display_name="Empty Patient")
            db.add(patient)
            db.commit()

        resp = c.get("/api/v1/patients/patient-empty/export/pdf")
        assert resp.status_code == 200
        doc = fitz.open(stream=resp.content, filetype="pdf")
        assert doc.page_count == 1
        page_text = doc[0].get_text()
        assert "Empty Patient" in page_text
        assert "No laboratory results available to display in timeline" in page_text
        assert "Generated from user-uploaded reports. Not medical advice. Verify against original reports." in page_text

    def test_nonexistent_patient_returns_404(self, client):
        c, _ = client
        resp = c.get("/api/v1/patients/nonexistent-uuid-1234/export/pdf")
        assert resp.status_code == 404
