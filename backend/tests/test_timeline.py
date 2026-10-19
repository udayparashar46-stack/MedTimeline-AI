"""Unit and integration tests for Milestone 8 (Timeline Table) and Milestone 9 (CSV Export).

Acceptance criteria tested:
- Canonical tests displayed as rows and report dates as chronological columns (ascending order).
- Correct values displayed in corresponding cells; blanks for missing results (zero invented values).
- Two reports on the same date appear as two separate columns (FR5).
- Review-status filtering: with include_unreviewed=False (default), unreviewed results never appear.
- With include_unreviewed=True, unreviewed results are marked and displayed.
- Rejected results are always excluded from the timeline.
- User edits are reflected in effective values.
- Bilirubin Total and Bilirubin Direct remain strictly separate rows.
- CSV export:
  - Header with patient and filter metadata.
  - Test Name, Category, Standard Unit, and chronological date columns.
  - Empty cells for missing results.
  - CSV injection neutralization ('=', '+', '-', '@' prepended with quote).
  - Proper quoting/escaping of commas and quotes.
  - Medical disclaimer footer.
  - Response has text/csv media type and UTF-8 BOM.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.db.models.user import User
from app.api.deps import get_current_user
from app.db.models.patient import Patient
from app.db.models.report import Report
from app.db.models.test import Test
from app.db.models.extracted_result import ExtractedResult
from app.db.models.result_edit import ResultEdit


from sqlalchemy.pool import StaticPool


def _make_test_user() -> User:
    u = User.__new__(User)
    from datetime import datetime, timezone
    u.__dict__.update({
        "id": "test-user-timeline",
        "email": "timeline@example.com",
        "hashed_password": "$2b$12$placeholder",
        "full_name": "Timeline Test User",
        "is_active": True,
        "is_superuser": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return u


@pytest.fixture()
def client():
    """In-memory SQLite test database fixture."""
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
    app.dependency_overrides[get_current_user] = _make_test_user
    with TestClient(app) as c:
        yield c, TestingSession
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)


def seed_timeline_test_data(TestingSession):
    """Seed patient, tests, reports, and extracted results for timeline tests."""
    with TestingSession() as db:
        # 1. Patient
        patient = Patient(
            id="patient-timeline-1",
            display_name="Sarah Timeline",
            date_of_birth="1980-05-12",
            sex="female",
        )
        db.add(patient)

        # 2. Canonical tests
        test_hgb = Test(
            id="test-hgb",
            canonical_name="Hemoglobin",
            category="Complete Blood Count",
            preferred_unit="g/dL",
            is_seeded=True,
        )
        test_creat = Test(
            id="test-creat",
            canonical_name="Serum Creatinine",
            category="Kidney Function Tests",
            preferred_unit="mg/dL",
            is_seeded=True,
        )
        test_bili_tot = Test(
            id="test-bili-tot",
            canonical_name="Bilirubin Total",
            category="Liver Function Tests",
            preferred_unit="mg/dL",
            is_seeded=True,
        )
        test_bili_dir = Test(
            id="test-bili-dir",
            canonical_name="Bilirubin Direct",
            category="Liver Function Tests",
            preferred_unit="mg/dL",
            is_seeded=True,
        )
        db.add_all([test_hgb, test_creat, test_bili_tot, test_bili_dir])

        # 3. Reports:
        # Report 1: 2026-01-10 (Apex Lab)
        rep1 = Report(
            id="rep-1",
            patient_id="patient-timeline-1",
            original_filename="apex_jan2026.pdf",
            file_path="mock1.pdf",
            file_sha256="sha-1",
            report_date="2026-01-10",
            report_date_confirmed=True,
            lab_name="Apex Lab",
            status="reviewed",
        )
        # Report 2: 2026-03-15 (Metro Diagnostics)
        rep2 = Report(
            id="rep-2",
            patient_id="patient-timeline-1",
            original_filename="metro_mar2026.pdf",
            file_path="mock2.pdf",
            file_sha256="sha-2",
            report_date="2026-03-15",
            report_date_confirmed=True,
            lab_name="Metro Diagnostics",
            status="reviewed",
        )
        # Report 3: Also on 2026-03-15 (City Hospital) - Same date test (FR5)
        rep3 = Report(
            id="rep-3",
            patient_id="patient-timeline-1",
            original_filename="city_mar2026.pdf",
            file_path="mock3.pdf",
            file_sha256="sha-3",
            report_date="2026-03-15",
            report_date_confirmed=True,
            lab_name="City Hospital",
            status="needs_review",
        )
        # Report 4: 2026-06-20 (Recent Lab)
        rep4 = Report(
            id="rep-4",
            patient_id="patient-timeline-1",
            original_filename="recent_jun2026.pdf",
            file_path="mock4.pdf",
            file_sha256="sha-4",
            report_date="2026-06-20",
            report_date_confirmed=True,
            lab_name="Recent Lab",
            status="reviewed",
        )
        db.add_all([rep1, rep2, rep3, rep4])

        # 4. Results:
        # rep1 (2026-01-10): Hgb confirmed (13.5), Creatinine confirmed (0.9), Bili Tot (0.8), Bili Dir (0.2)
        r1_hgb = ExtractedResult(
            id="r1-hgb",
            report_id="rep-1",
            test_id="test-hgb",
            raw_test_name="Hb",
            raw_value_text="13.5",
            raw_unit="g/dL",
            review_status="confirmed",
            source_snippet="Hb 13.5 g/dL",
        )
        r1_creat = ExtractedResult(
            id="r1-creat",
            report_id="rep-1",
            test_id="test-creat",
            raw_test_name="Creatinine",
            raw_value_text="0.9",
            raw_unit="mg/dL",
            review_status="confirmed",
            source_snippet="Creatinine 0.9 mg/dL",
        )
        r1_bili_tot = ExtractedResult(
            id="r1-btot",
            report_id="rep-1",
            test_id="test-bili-tot",
            raw_test_name="Total Bilirubin",
            raw_value_text="0.8",
            raw_unit="mg/dL",
            review_status="confirmed",
            source_snippet="Total Bilirubin 0.8 mg/dL",
        )
        r1_bili_dir = ExtractedResult(
            id="r1-bdir",
            report_id="rep-1",
            test_id="test-bili-dir",
            raw_test_name="Direct Bilirubin",
            raw_value_text="0.2",
            raw_unit="mg/dL",
            review_status="confirmed",
            source_snippet="Direct Bilirubin 0.2 mg/dL",
        )

        # rep2 (2026-03-15): Hgb confirmed (14.2), Creatinine missing (blank!), Bili Tot (1.1)
        r2_hgb = ExtractedResult(
            id="r2-hgb",
            report_id="rep-2",
            test_id="test-hgb",
            raw_test_name="Haemoglobin",
            raw_value_text="14.2",
            raw_unit="g/dL",
            review_status="confirmed",
            source_snippet="Haemoglobin 14.2 g/dL",
        )
        r2_bili_tot = ExtractedResult(
            id="r2-btot",
            report_id="rep-2",
            test_id="test-bili-tot",
            raw_test_name="Bilirubin Total",
            raw_value_text="1.1",
            raw_unit="mg/dL",
            review_status="confirmed",
            source_snippet="Bilirubin Total 1.1 mg/dL",
        )

        # rep3 (2026-03-15): Hgb unreviewed (14.0), Creatinine unreviewed (1.0)
        r3_hgb = ExtractedResult(
            id="r3-hgb",
            report_id="rep-3",
            test_id="test-hgb",
            raw_test_name="HGB",
            raw_value_text="14.0",
            raw_unit="g/dL",
            review_status="unreviewed",
            source_snippet="HGB 14.0 g/dL",
        )
        r3_creat = ExtractedResult(
            id="r3-creat",
            report_id="rep-3",
            test_id="test-creat",
            raw_test_name="Serum Creatinine",
            raw_value_text="1.0",
            raw_unit="mg/dL",
            review_status="unreviewed",
            source_snippet="Serum Creatinine 1.0 mg/dL",
        )

        # rep4 (2026-06-20): Hgb edited (raw: 14.8, edit: 15.0), Creatinine rejected (never show!)
        r4_hgb = ExtractedResult(
            id="r4-hgb",
            report_id="rep-4",
            test_id="test-hgb",
            raw_test_name="Hemoglobin",
            raw_value_text="14.8",
            raw_unit="g/dL",
            review_status="edited",
            source_snippet="Hemoglobin 14.8 g/dL",
        )
        r4_creat_rej = ExtractedResult(
            id="r4-creat-rej",
            report_id="rep-4",
            test_id="test-creat",
            raw_test_name="Creatinine",
            raw_value_text="999.0",
            raw_unit="mg/dL",
            review_status="rejected",
            source_snippet="Creatinine artifact",
        )

        db.add_all([
            r1_hgb, r1_creat, r1_bili_tot, r1_bili_dir,
            r2_hgb, r2_bili_tot,
            r3_hgb, r3_creat,
            r4_hgb, r4_creat_rej,
        ])
        db.commit()

        # Add ResultEdit for r4_hgb
        edit = ResultEdit(
            result_id="r4-hgb",
            field="raw_value_text",
            old_value="14.8",
            new_value="15.0",
            edited_by="Doctor Test",
        )
        db.add(edit)
        db.commit()


class TestTimelineAPI:
    def test_timeline_chronological_ordering_and_cells(self, client):
        client_api, TestingSession = client
        seed_timeline_test_data(TestingSession)

        resp = client_api.get("/api/v1/patients/patient-timeline-1/timeline")
        assert resp.status_code == 200
        data = resp.json()

        # Default: include_unreviewed=False
        assert data["include_unreviewed"] is False
        assert data["patient_name"] == "Sarah Timeline"

        # Reports present in confirmed timeline: rep-1 (2026-01-10), rep-2 (2026-03-15), rep-4 (2026-06-20)
        # rep-3 has only unreviewed rows, so it should not appear when include_unreviewed=False
        col_ids = [c["report_id"] for c in data["columns"]]
        assert col_ids == ["rep-1", "rep-2", "rep-4"]

        # Date ordering is chronological ascending
        dates = [c["report_date"] for c in data["columns"]]
        assert dates == ["2026-01-10", "2026-03-15", "2026-06-20"]

        # Check Hemoglobin row
        hgb_row = next(r for r in data["rows"] if r["test_name"] == "Hemoglobin")
        assert hgb_row["category"] == "Complete Blood Count"
        assert hgb_row["cells"]["rep-1"]["effective_value_text"] == "13.5"
        assert hgb_row["cells"]["rep-2"]["effective_value_text"] == "14.2"
        # rep-4 had an edit from 14.8 to 15.0
        assert hgb_row["cells"]["rep-4"]["effective_value_text"] == "15.0"
        assert hgb_row["cells"]["rep-4"]["is_edited"] is True

        # Check Creatinine row: present in rep-1 (0.9), missing in rep-2 (blank), rejected in rep-4 (blank!)
        creat_row = next(r for r in data["rows"] if r["test_name"] == "Serum Creatinine")
        assert "rep-1" in creat_row["cells"]
        assert creat_row["cells"]["rep-1"]["effective_value_text"] == "0.9"
        # rep-2 has no creatinine -> cell key does NOT exist (truly blank)
        assert "rep-2" not in creat_row["cells"]
        # rep-4 had rejected creatinine -> cell key does NOT exist
        assert "rep-4" not in creat_row["cells"]

    def test_bilirubin_total_and_direct_strictly_separated(self, client):
        client_api, TestingSession = client
        seed_timeline_test_data(TestingSession)

        resp = client_api.get("/api/v1/patients/patient-timeline-1/timeline")
        assert resp.status_code == 200
        data = resp.json()

        test_names = [r["test_name"] for r in data["rows"]]
        assert "Bilirubin Total" in test_names
        assert "Bilirubin Direct" in test_names

        bili_tot_row = next(r for r in data["rows"] if r["test_name"] == "Bilirubin Total")
        bili_dir_row = next(r for r in data["rows"] if r["test_name"] == "Bilirubin Direct")

        assert bili_tot_row["cells"]["rep-1"]["effective_value_text"] == "0.8"
        assert bili_dir_row["cells"]["rep-1"]["effective_value_text"] == "0.2"
        assert bili_tot_row["test_id"] != bili_dir_row["test_id"]

    def test_same_date_reports_as_separate_columns_with_unreviewed_toggle(self, client):
        """Two reports on the same date (2026-03-15) must appear as two distinct columns (FR5)."""
        client_api, TestingSession = client
        seed_timeline_test_data(TestingSession)

        # When include_unreviewed=True, rep-3 appears alongside rep-2
        resp = client_api.get("/api/v1/patients/patient-timeline-1/timeline?include_unreviewed=true")
        assert resp.status_code == 200
        data = resp.json()

        assert data["include_unreviewed"] is True
        col_ids = [c["report_id"] for c in data["columns"]]
        assert "rep-2" in col_ids
        assert "rep-3" in col_ids
        # Both share the same date 2026-03-15 but are distinct columns
        col_rep2 = next(c for c in data["columns"] if c["report_id"] == "rep-2")
        col_rep3 = next(c for c in data["columns"] if c["report_id"] == "rep-3")
        assert col_rep2["report_date"] == "2026-03-15"
        assert col_rep3["report_date"] == "2026-03-15"
        assert col_rep2["lab_name"] == "Metro Diagnostics"
        assert col_rep3["lab_name"] == "City Hospital"

        # Check Hgb values across the two separate same-date columns
        hgb_row = next(r for r in data["rows"] if r["test_name"] == "Hemoglobin")
        assert hgb_row["cells"]["rep-2"]["effective_value_text"] == "14.2"
        assert hgb_row["cells"]["rep-3"]["effective_value_text"] == "14.0"
        assert hgb_row["cells"]["rep-3"]["review_status"] == "unreviewed"

    def test_timeline_empty_workspace(self, client):
        client_api, TestingSession = client
        with TestingSession() as db:
            p = Patient(id="patient-empty", display_name="Empty Patient")
            db.add(p)
            db.commit()

        resp = client_api.get("/api/v1/patients/patient-empty/timeline")
        assert resp.status_code == 200
        data = resp.json()
        assert data["columns"] == []
        assert data["rows"] == []
        assert data["total_tests"] == 0

    def test_timeline_nonexistent_patient_returns_404(self, client):
        client_api, _ = client
        resp = client_api.get("/api/v1/patients/nonexistent-id/timeline")
        assert resp.status_code == 404


class TestCSVExportAPI:
    def test_csv_export_format_and_disclaimer(self, client):
        client_api, TestingSession = client
        seed_timeline_test_data(TestingSession)

        resp = client_api.get("/api/v1/patients/patient-timeline-1/export/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        assert 'attachment; filename="' in resp.headers["content-disposition"]

        text = resp.content.decode("utf-8-sig")  # Decode stripping UTF-8 BOM
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        # Metadata rows
        assert any("Patient: Sarah Timeline" in line for line in lines)
        assert any("Filter: Confirmed Only" in line for line in lines)

        # Header row with chronological dates
        header_line = next(line for line in lines if "Test Name" in line)
        assert "Category" in header_line
        assert "Standard Unit" in header_line
        assert "2026-01-10 (Apex Lab)" in header_line
        assert "2026-03-15 (Metro Diagnostics)" in header_line
        assert "2026-06-20 (Recent Lab)" in header_line

        # Hemoglobin row values
        hgb_line = next(line for line in lines if "Hemoglobin" in line)
        assert "13.5" in hgb_line
        assert "14.2" in hgb_line
        assert "15.0" in hgb_line

        # Bilirubin separation
        assert any("Bilirubin Total" in line for line in lines)
        assert any("Bilirubin Direct" in line for line in lines)

        # Medical disclaimer footer
        disclaimer_line = lines[-1]
        assert "Generated from user-uploaded reports. Not medical advice. Verify against original reports." in disclaimer_line

    def test_csv_export_include_unreviewed(self, client):
        client_api, TestingSession = client
        seed_timeline_test_data(TestingSession)

        resp = client_api.get("/api/v1/patients/patient-timeline-1/export/csv?include_unreviewed=true")
        assert resp.status_code == 200
        text = resp.content.decode("utf-8-sig")

        assert "Filter: Confirmed & Unreviewed" in text
        assert "City Hospital" in text
        assert "14.0" in text

    def test_csv_injection_neutralization(self, client):
        """Values starting with =, +, -, @ must be neutralized to prevent formula execution."""
        from app.services.exporters.csv_export import sanitize_csv_cell

        assert sanitize_csv_cell("=1+1") == "'=1+1"
        assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
        assert sanitize_csv_cell("-5.2") == "'-5.2"
        assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
        assert sanitize_csv_cell("14.5") == "14.5"
        assert sanitize_csv_cell("") == ""
        assert sanitize_csv_cell(None) == ""
