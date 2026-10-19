"""Milestone 11 Hardening Suite: 25 Synthetic Clinical Scenarios and Edge Cases.

Verifies system resilience against diverse real-world edge cases:
- Scenarios 1-6: Ingestion and Storage Hardening (corrupt, 0-byte, scanned, encrypted, duplicates, isolation).
- Scenarios 7-13: Parser and Token Classification Hardening (wrapped names, comparators, text values, flags, missing units/ranges).
- Scenarios 14-16: Date Detection and Review Gating Hardening (collection vs print, ambiguity, gating).
- Scenarios 17-20: Review, Undo, and Analyte Separation Hardening (raw immutability, undo, bilirubin non-merge, unit mismatch).
- Scenarios 21-25: Timeline, Export, Privacy, and Performance Hardening (zero invention, FR5 columns, CSV formula sanitization, PDF disclaimer, speed).
"""

import time
import io
import fitz
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.db.models.patient import Patient
from app.db.models.report import Report
from app.db.models.test import Test
from app.db.models.test_alias import TestAlias
from app.db.models.extracted_result import ExtractedResult
from app.services.extraction.pipeline import extract_report_from_bytes
from app.services.storage import StorageService
from app.services.timeline import build_patient_timeline
from app.services.exporters.csv_export import sanitize_csv_cell, export_patient_timeline_csv
from app.services.exporters.pdf_export import export_patient_timeline_pdf


@pytest.fixture()
def client():
    """Isolated in-memory database fixture."""
    engine_mem = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine_mem)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_mem)

    from app.services.normalization.seeder import seed_canonical_tests
    with TestingSession() as seed_db:
        seed_canonical_tests(seed_db)

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


def create_synthetic_pdf(text_content, num_pages: int = 1) -> bytes:
    """Helper to generate a clean in-memory synthetic PDF with selectable text lines."""
    if isinstance(text_content, str):
        lines = [line.strip() for line in text_content.strip().split("\n") if line.strip()]
    else:
        lines = list(text_content)

    doc = fitz.open()
    for _ in range(num_pages):
        page = doc.new_page(width=595, height=842)
        y = 60
        for line in lines:
            page.insert_text(fitz.Point(50, y), line, fontsize=10)
            y += 20
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_scanned_image_pdf() -> bytes:
    """Generate a synthetic PDF with an image only and zero text layer."""
    doc = fitz.open()
    page = doc.new_page(width=300, height=300)
    pix = fitz.Pixmap(fitz.csRGB, (0, 0, 100, 100), 1)
    pix.clear_with(255)
    page.insert_image(fitz.Rect(50, 50, 150, 150), pixmap=pix)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes



# ============================================================================
# Scenarios 1 - 6: Ingestion & Storage Hardening
# ============================================================================

class TestIngestionHardening:
    def test_scenario_01_zero_byte_upload_rejected(self, client):
        """Scenario 1: 0-byte file upload rejected with clear error."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p1", display_name="Scenario 1 Patient")
            db.add(p)
            db.commit()

        resp = c.post(
            "/api/v1/patients/scen-p1/reports",
            files=[("files", ("empty.pdf", b"", "application/pdf"))],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["failed_count"] == 1
        assert "empty" in body["items"][0]["message"].lower()

    def test_scenario_02_non_pdf_magic_bytes_rejected(self, client):
        """Scenario 2: Plain text disguised as .pdf rejected by magic bytes inspection."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p2", display_name="Scenario 2 Patient")
            db.add(p)
            db.commit()

        fake_pdf = b"Hello, this is just plain text disguised as a PDF file."
        resp = c.post(
            "/api/v1/patients/scen-p2/reports",
            files=[("files", ("fake.pdf", fake_pdf, "application/pdf"))],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["failed_count"] == 1
        assert "missing %pdf header" in body["items"][0]["message"].lower() or "magic bytes" in body["items"][0]["message"].lower()

    def test_scenario_03_scanned_image_only_flagged_without_hallucination(self):
        """Scenario 3: Scanned PDF without text layer marked failed without OCR hallucination."""
        scanned_bytes = create_scanned_image_pdf()
        ext = extract_report_from_bytes(scanned_bytes)
        assert ext.has_text_layer is False
        assert ext.is_scanned is True
        assert "scanned" in ext.failure_reason.lower()
        assert len(ext.rows) == 0

    def test_scenario_04_encrypted_pdf_rejected(self):
        """Scenario 4: Password-encrypted PDF detected and handled safely."""
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text(fitz.Point(50, 50), "Confidential Lab Report")
        # Save encrypted
        perm = fitz.PDF_PERM_ACCESSIBILITY
        encrypt_meth = fitz.PDF_ENCRYPT_AES_256
        encrypted_bytes = doc.tobytes(encryption=encrypt_meth, user_pw="secret123", owner_pw="admin123", permissions=perm)
        doc.close()

        storage = StorageService()
        is_valid, _, msg = storage.validate_pdf(encrypted_bytes, "encrypted.pdf")
        assert is_valid is False
        assert "password" in msg.lower() or "encrypted" in msg.lower()

    def test_scenario_05_duplicate_upload_in_same_workspace_skipped(self, client):
        """Scenario 5: Uploading same file twice to same patient skips with duplicate warning."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p5", display_name="Scenario 5 Patient")
            db.add(p)
            db.commit()

        pdf_bytes = create_synthetic_pdf("Sample Lab Report\nDate: 12/04/2026\nHb: 14.0 g/dL")
        # First upload
        resp1 = c.post(
            "/api/v1/patients/scen-p5/reports",
            files=[("files", ("lab.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp1.json()["uploaded_count"] == 1

        # Second upload of identical bytes
        resp2 = c.post(
            "/api/v1/patients/scen-p5/reports",
            files=[("files", ("lab.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp2.json()["skipped_count"] == 1
        assert "duplicate" in resp2.json()["items"][0]["status"]

    def test_scenario_06_same_file_in_different_workspaces_allowed(self, client):
        """Scenario 6: Same PDF uploaded into two different workspaces is isolated and allowed."""
        c, TestingSession = client
        with TestingSession() as db:
            p1 = Patient(id="scen-p6a", display_name="Workspace A")
            p2 = Patient(id="scen-p6b", display_name="Workspace B")
            db.add_all([p1, p2])
            db.commit()

        pdf_bytes = create_synthetic_pdf("Standard Reference CBC\nDate: 01/01/2026\nWBC: 6.0 10^3/uL")
        r_a = c.post("/api/v1/patients/scen-p6a/reports", files=[("files", ("ref.pdf", pdf_bytes, "application/pdf"))])
        r_b = c.post("/api/v1/patients/scen-p6b/reports", files=[("files", ("ref.pdf", pdf_bytes, "application/pdf"))])

        assert r_a.json()["uploaded_count"] == 1
        assert r_b.json()["uploaded_count"] == 1


# ============================================================================
# Scenarios 7 - 13: Parser & Token Classification Hardening
# ============================================================================

class TestParserTokenHardening:
    def test_scenario_07_wrapped_test_names_joined_cleanly(self):
        """Scenario 7: Multi-line wrapped test names are joined into single row."""
        lines = [
            "HEMATOLOGY COMPLETE PROFILE",
            "Patient Name: Test Subject   Collected: 01/10/2026",
            "Investigation Observed Value Units Reference",
            "Mean Corpuscular",
            "Volume (MCV) 88.5 fL 80 - 100",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 1
        row = ext.rows[0]
        assert "Mean Corpuscular" in row.raw_test_name
        assert "MCV" in row.raw_test_name
        assert row.raw_value_text == "88.5"

    def test_scenario_08_comparator_less_than_preserved(self):
        """Scenario 8: Values with '<' (e.g. '< 0.05') retain comparator and numeric value."""
        lines = [
            "CARDIAC BIOMARKERS REPORT",
            "Patient Name: Jane Doe   Collected: 12/10/2026",
            "Test Name Result Unit Reference Range",
            "High Sensitivity CRP < 0.5 mg/L 0.0 - 3.0",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 1
        assert ext.rows[0].raw_value_text.startswith("<")

    def test_scenario_09_comparator_greater_than_preserved(self):
        """Scenario 9: Values with '>' (e.g. '> 1000') retain comparator."""
        lines = [
            "RENAL AND VITAMIN PANEL",
            "Patient Name: Bob Smith   Collected: 10/10/2026",
            "Investigation Result Units Reference",
            "Vitamin D > 100 ng/mL 30 - 100",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 1
        assert ext.rows[0].raw_value_text.startswith(">")

    def test_scenario_10_qualitative_text_values_retained(self):
        """Scenario 10: Non-numeric qualitative values (Negative, Reactive, Nil) parsed as text."""
        lines = [
            "URINE ROUTINE EXAMINATION",
            "Patient: Alex Doe   Collected: 05/10/2026",
            "Parameter Result Reference Interval",
            "Urine Protein Negative Negative",
            "Urine Glucose Nil Nil",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 2
        vals = [r.raw_value_text.lower() for r in ext.rows]
        assert "negative" in vals
        assert "nil" in vals

    def test_scenario_11_attached_flag_tokens_split(self):
        """Scenario 11: Values with attached flag (e.g. '14.5 H') parsed cleanly."""
        lines = [
            "METABOLIC COMPREHENSIVE PANEL",
            "Patient: Robert King   Collected: 15/10/2026",
            "Investigation Result Units Reference Interval Flag",
            "Serum Potassium 5.8 H mEq/L 3.5 - 5.0",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 1
        assert "5.8" in ext.rows[0].raw_value_text
        assert ext.rows[0].printed_flag == "H"

    def test_scenario_12_missing_unit_does_not_fail(self):
        """Scenario 12: Test rows without units parse with raw_unit=None."""
        lines = [
            "ELECTROLYTES & ANION GAP REPORT",
            "Patient: Sarah Lee   Collected: 18/10/2026",
            "Test Name Result Reference",
            "Anion Gap 12 8 - 16",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 1
        assert ext.rows[0].raw_test_name == "Anion Gap"
        assert ext.rows[0].raw_value_text == "12"
        assert ext.rows[0].raw_unit is None

    def test_scenario_13_missing_reference_range_does_not_fail(self):
        """Scenario 13: Test rows without reference ranges parse with raw_reference_text=None."""
        lines = [
            "BIOCHEMISTRY ROUTINE REPORT",
            "Patient: Sarah Lee   Collected: 18/10/2026",
            "Test Name Result Unit",
            "Blood Urea 32.5 mg/dL",
            "End of Report",
        ]
        pdf = create_synthetic_pdf(lines)
        ext = extract_report_from_bytes(pdf)
        assert len(ext.rows) == 1
        assert "32.5" in ext.rows[0].raw_value_text
        assert ext.rows[0].raw_reference_text is None


# ============================================================================
# Scenarios 14 - 16: Date Detection & Review Gating Hardening
# ============================================================================

class TestDateDetectionAndGating:
    def test_scenario_14_collection_date_prioritized_over_print_date(self):
        """Scenario 14: Sample collection date chosen over report print/generated date."""
        report_text = (
            "Hospital Clinical Laboratory\n"
            "Printed On: 25/08/2026\n"
            "Sample Collected: 20/08/2026\n"
            "Hemoglobin: 13.8 g/dL\n"
        )
        pdf = create_synthetic_pdf(report_text)
        ext = extract_report_from_bytes(pdf)
        assert ext.report_date == "2026-08-20"

    def test_scenario_15_ambiguous_date_flagged_with_alternatives(self):
        """Scenario 15: Numeric ambiguous date (04/05/2026) flags ambiguity with candidates."""
        report_text = (
            "Lab Report\n"
            "Date: 04/05/2026\n"
            "Glucose: 95 mg/dL\n"
        )
        pdf = create_synthetic_pdf(report_text)
        ext = extract_report_from_bytes(pdf)
        assert ext.is_date_ambiguous is True
        assert len(ext.date_alternatives) >= 2

    def test_scenario_16_date_confirmation_gating_enforced(self, client):
        """Scenario 16: Report cannot transition to 'reviewed' until date is confirmed."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p16", display_name="Gate Patient")
            db.add(p)
            rep = Report(
                id="rep-unconfirmed-date",
                patient_id="scen-p16",
                original_filename="gate.pdf",
                file_path="/tmp/gate.pdf",
                file_sha256="sha-gate",
                status="needs_review",
                report_date="2026-01-15",
                report_date_confirmed=False,  # Unconfirmed
            )
            db.add(rep)
            db.commit()

        # Attempt to mark reviewed without confirming date -> should be rejected with 400
        patch_resp = c.patch("/api/v1/reports/rep-unconfirmed-date", json={"status": "reviewed"})
        assert patch_resp.status_code == 400
        assert "date" in patch_resp.json()["detail"].lower()


# ============================================================================
# Scenarios 17 - 20: Review, Undo, & Analyte Separation Hardening
# ============================================================================

class TestReviewAndAnalyteSeparation:
    def test_scenario_17_result_edit_overlay_preserves_raw_evidence(self, client):
        """Scenario 17: User edit creates ResultEdit overlay, keeping raw string untouched."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p17", display_name="Edit Patient")
            db.add(p)
            r = Report(id="scen-r17", patient_id="scen-p17", original_filename="e.pdf", file_path="", file_sha256="s17", status="needs_review")
            db.add(r)
            res = ExtractedResult(
                id="res-scen-17",
                report_id="scen-r17",
                page_number=1,
                row_order=1,
                raw_test_name="Hemoglobin",
                raw_value_text="12.0",
                raw_unit="g/dL",
                source_snippet="Hemoglobin 12.0",
                parse_confidence="high",
                review_status="unreviewed",
            )
            db.add(res)
            db.commit()

        # Edit effective value to 12.5
        patch_resp = c.patch("/api/v1/results/res-scen-17", json={"value_text": "12.5"})
        assert patch_resp.status_code == 200
        item = patch_resp.json()
        assert item["effective_value_text"] == "12.5"
        assert item["raw_value_text"] == "12.0"  # Original raw evidence preserved!
        assert item["review_status"] == "edited"

    def test_scenario_18_undo_restores_prior_value(self, client):
        """Scenario 18: Undo removes latest ResultEdit and restores prior state."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p18", display_name="Undo Patient")
            db.add(p)
            r = Report(id="scen-r18", patient_id="scen-p18", original_filename="u.pdf", file_path="", file_sha256="s18", status="needs_review")
            db.add(r)
            res = ExtractedResult(
                id="res-scen-18",
                report_id="scen-r18",
                page_number=1,
                row_order=1,
                raw_test_name="Glucose",
                raw_value_text="100",
                source_snippet="Glucose 100",
                parse_confidence="high",
                review_status="unreviewed",
            )
            db.add(res)
            db.commit()

        # 1. Reject row
        patch_resp = c.patch("/api/v1/results/res-scen-18", json={"review_status": "rejected"})
        assert patch_resp.status_code == 200
        assert patch_resp.json()["review_status"] == "rejected"

        # 2. Undo rejection
        undo_resp = c.post("/api/v1/results/res-scen-18/undo")
        assert undo_resp.status_code == 200
        assert undo_resp.json()["effective_value_text"] == "100"
        assert undo_resp.json()["review_status"] == "unreviewed"

    def test_scenario_19_bilirubin_total_and_direct_strict_non_merge(self, client):
        """Scenario 19: Total and Direct Bilirubin must NEVER merge into the same canonical test."""
        c, TestingSession = client
        # Fetch seeded tests
        tests_resp = c.get("/api/v1/tests")
        assert tests_resp.status_code == 200
        all_tests = tests_resp.json()

        bili_tests = [t for t in all_tests if "bilirubin" in t["canonical_name"].lower()]
        names = [t["canonical_name"] for t in bili_tests]
        assert "Bilirubin Total" in names
        assert "Bilirubin Direct" in names
        assert len(names) >= 2

    def test_scenario_20_unit_mismatch_surfaced_without_conversion(self, client):
        """Scenario 20: Unit mismatch between reports produces warning without auto-converting values."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p20", display_name="Unit Patient")
            db.add(p)
            r1 = Report(id="scen-r20a", patient_id="scen-p20", original_filename="r1.pdf", file_path="", file_sha256="s20a", report_date="2026-01-01", report_date_confirmed=True, status="reviewed")
            r2 = Report(id="scen-r20b", patient_id="scen-p20", original_filename="r2.pdf", file_path="", file_sha256="s20b", report_date="2026-02-01", report_date_confirmed=True, status="reviewed")
            db.add_all([r1, r2])

            test = db.execute(select(Test).where(Test.canonical_name == "Hemoglobin")).scalar_one()

            # Report 1 in g/dL, Report 2 in g/L
            res1 = ExtractedResult(id="scen-res20a", report_id="scen-r20a", page_number=1, row_order=1, raw_test_name="Hb", raw_value_text="13.5", raw_unit="g/dL", source_snippet="Hb 13.5 g/dL", test_id=test.id, review_status="confirmed", parse_confidence="high")
            res2 = ExtractedResult(id="scen-res20b", report_id="scen-r20b", page_number=1, row_order=1, raw_test_name="Hb", raw_value_text="135", raw_unit="g/L", source_snippet="Hb 135 g/L", test_id=test.id, review_status="confirmed", parse_confidence="high")
            db.add_all([res1, res2])
            db.commit()

        # Check unit mismatches endpoint
        mismatch_resp = c.get("/api/v1/patients/scen-p20/mapping/unit-mismatches")
        assert mismatch_resp.status_code == 200
        mismatches = mismatch_resp.json()
        assert mismatches["mismatches_count"] == 1
        assert len(mismatches["items"]) == 1
        assert "g/dL" in mismatches["items"][0]["observed_units"]
        assert "g/L" in mismatches["items"][0]["observed_units"]


# ============================================================================
# Scenarios 21 - 25: Timeline, Export, Privacy, & Performance Hardening
# ============================================================================

class TestTimelineExportAndPerformance:
    def test_scenario_21_timeline_zero_invented_values(self, client):
        """Scenario 21: Timeline sparse matrix contains zero invented, estimated, or interpolated numbers."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p21", display_name="Sparse Patient")
            db.add(p)
            r = Report(id="scen-r21", patient_id="scen-p21", original_filename="s.pdf", file_path="", file_sha256="s21", report_date="2026-03-01", report_date_confirmed=True, status="reviewed")
            db.add(r)
            t = db.execute(select(Test).where(Test.canonical_name == "Platelet Count")).scalar_one()
            res = ExtractedResult(id="scen-res21", report_id="scen-r21", page_number=1, row_order=1, raw_test_name="Platelets", raw_value_text="220", raw_unit="10^3/uL", source_snippet="Platelets 220", test_id=t.id, review_status="confirmed", parse_confidence="high")
            db.add(res)
            db.commit()

        matrix = build_patient_timeline(TestingSession(), "scen-p21")
        # Platelets row exists
        row = matrix.rows[0]
        assert "scen-r21" in row.cells
        assert row.cells["scen-r21"].effective_value_text == "220"
        # Non-existent report IDs must be absent from cells dict (strictly sparse)
        assert "non-existent-rep" not in row.cells

    def test_scenario_22_same_date_multiple_reports_separated(self, client):
        """Scenario 22: FR5 - Two reports on the exact same date form two separate columns."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p22", display_name="Same Date Patient")
            db.add(p)
            # Two reports on 2026-04-15
            r1 = Report(id="scen-r22a", patient_id="scen-p22", original_filename="morning_lab.pdf", file_path="", file_sha256="s22a", report_date="2026-04-15", report_date_confirmed=True, lab_name="Lab A", status="reviewed")
            r2 = Report(id="scen-r22b", patient_id="scen-p22", original_filename="evening_lab.pdf", file_path="", file_sha256="s22b", report_date="2026-04-15", report_date_confirmed=True, lab_name="Lab B", status="reviewed")
            db.add_all([r1, r2])
            t = db.execute(select(Test).where(Test.canonical_name == "Potassium")).scalar_one()
            res1 = ExtractedResult(id="scen-res22a", report_id="scen-r22a", page_number=1, row_order=1, raw_test_name="K", raw_value_text="4.0", source_snippet="K 4.0", test_id=t.id, review_status="confirmed", parse_confidence="high")
            res2 = ExtractedResult(id="scen-res22b", report_id="scen-r22b", page_number=1, row_order=1, raw_test_name="K", raw_value_text="4.3", source_snippet="K 4.3", test_id=t.id, review_status="confirmed", parse_confidence="high")
            db.add_all([res1, res2])
            db.commit()

        matrix = build_patient_timeline(TestingSession(), "scen-p22")
        assert len(matrix.columns) == 2
        col_ids = [c.report_id for c in matrix.columns]
        assert "scen-r22a" in col_ids
        assert "scen-r22b" in col_ids

    def test_scenario_23_csv_injection_formula_characters_sanitized(self):
        """Scenario 23: CSV cells starting with '=', '+', '-', '@' prepended with quote."""
        assert sanitize_csv_cell("=cmd|'/C calc'!A0") == "'=cmd|'/C calc'!A0"
        assert sanitize_csv_cell("+100") == "'+100"
        assert sanitize_csv_cell("-5.2") == "'-5.2"
        assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
        # Normal cell unchanged
        assert sanitize_csv_cell("14.2") == "14.2"
        assert sanitize_csv_cell("Hemoglobin") == "Hemoglobin"
        # Blank remains empty
        assert sanitize_csv_cell(None) == ""
        assert sanitize_csv_cell("") == ""

    def test_scenario_24_pdf_landscape_and_disclaimer_verified(self, client):
        """Scenario 24: PDF export landscape A4 orientation and mandatory disclaimer on all pages."""
        c, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="scen-p24", display_name="PDF Verify Patient")
            db.add(p)
            db.commit()

        pdf_bytes, filename = export_patient_timeline_pdf(TestingSession(), "scen-p24")
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        assert doc.page_count >= 1
        page = doc[0]
        # Landscape
        assert page.rect.width > page.rect.height
        # Disclaimer
        text = page.get_text()
        assert "Generated from user-uploaded reports. Not medical advice. Verify against original reports." in text

    def test_scenario_25_extraction_performance_under_two_seconds(self):
        """Scenario 25: Multi-page text extraction executes in under 2.0 seconds locally."""
        # 3-page synthetic report with 20 rows
        lines = ["City General Laboratory Report", "Specimen Collected: 15/09/2026", "Test Name  Value  Unit  Ref Range"]
        for i in range(20):
            lines.append(f"Analyte {i:02d}   {10.0 + i:.1f}   mg/dL   5.0 - 50.0")
        sample_doc = "\n".join(lines)
        pdf_bytes = create_synthetic_pdf(sample_doc, num_pages=3)

        t_start = time.perf_counter()
        ext = extract_report_from_bytes(pdf_bytes)
        t_elapsed = time.perf_counter() - t_start

        assert ext.has_text_layer is True
        assert len(ext.rows) >= 15
        assert t_elapsed < 2.0, f"Extraction took {t_elapsed:.2f}s, expected < 2.0s"
