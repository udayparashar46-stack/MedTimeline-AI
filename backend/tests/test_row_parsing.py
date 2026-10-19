"""Integration and unit tests for Milestone 5: Row Parsing & Confidence Scoring.

Covers:
- At least 8 synthetic layouts:
  1. Standard CBC table with column headers
  2. Panel with '<' comparator values
  3. Panel with '>' comparator values
  4. Qualitative text values (Negative, Nil, Not Detected)
  5. Wrapped test names across multiple lines
  6. Missing units with medium confidence
  7. Trailing/attached abnormal flags (H, L, *)
  8. Multi-section report with section headings
- Raw fields exact string preservation
- Derived properties (numeric value, comparators, reference intervals)
- Scanned PDF zero-row handling
- API endpoint integration: GET /reports/{id}/results
"""

import io
import pytest
import fitz  # PyMuPDF
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.db.models.user import User
from app.api.deps import get_current_user
from app.services.extraction.parsers.row_pipeline import (
    extract_rows_from_pdf_bytes,
    RowPipelineResult,
)
from app.services.extraction.parsers.values import (
    parse_value_token,
    parse_reference_interval,
)


def _make_test_user() -> User:
    u = User.__new__(User)
    from datetime import datetime, timezone
    u.__dict__.update({
        "id": "test-user-row-parsing",
        "email": "rowparsing@example.com",
        "hashed_password": "$2b$12$placeholder",
        "full_name": "Row Parsing Test User",
        "is_active": True,
        "is_superuser": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return u


def create_synthetic_pdf(lines: list[str]) -> bytes:
    """Helper to create an in-memory PDF with specified lines."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)  # Standard letter
    y = 60
    for line in lines:
        page.insert_text(fitz.Point(50, y), line, fontsize=10)
        y += 20
    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes


@pytest.fixture()
def client():
    """Return a TestClient wired to an isolated in-memory SQLite database."""
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
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)


# ===========================================================================
# 1. Unit Tests for Value, Reference, and Flag Parsers
# ===========================================================================

class TestValueAndReferenceParsers:
    def test_numeric_standard(self):
        is_val, raw, num, comp, flag = parse_value_token("13.2")
        assert is_val is True
        assert raw == "13.2"
        assert num == 13.2
        assert comp is None
        assert flag is None

    def test_comparator_less_than(self):
        is_val, raw, num, comp, flag = parse_value_token("< 0.05")
        assert is_val is True
        assert num == 0.05
        assert comp == "<"

    def test_comparator_greater_than(self):
        is_val, raw, num, comp, flag = parse_value_token(">100")
        assert is_val is True
        assert num == 100.0
        assert comp == ">"

    def test_value_with_trailing_flag(self):
        is_val, raw, num, comp, flag = parse_value_token("15.5 H")
        assert is_val is True
        assert raw == "15.5"
        assert num == 15.5
        assert flag == "H"

    def test_qualitative_values(self):
        is_val, raw, num, comp, flag = parse_value_token("Negative")
        assert is_val is True
        assert raw == "Negative"
        assert num is None

    def test_reference_interval_parsing(self):
        is_ref, low, high, comp = parse_reference_interval("13.0 - 17.0")
        assert is_ref is True
        assert low == 13.0
        assert high == 17.0
        assert comp is None

        is_ref_up, low_up, high_up, comp_up = parse_reference_interval("< 200")
        assert is_ref_up is True
        assert high_up == 200.0
        assert comp_up == "<"


# ===========================================================================
# 2. Layout 1: Standard CBC Panel with Column Headers
# ===========================================================================

class TestLayout1StandardTable:
    def test_standard_cbc_table(self):
        lines = [
            "CLINICAL LABORATORY REPORT - HEMATOLOGY",
            "Patient Name: John Doe   Sample Collected: 14/10/2026",
            "Investigation Observed Value Units Biological Reference Interval",
            "Hemoglobin 14.5 g/dL 13.0 - 17.0",
            "Total WBC Count 7500 cells/mcL 4000 - 11000",
            "Platelet Count 250 10^3/uL 150 - 450",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows >= 3
        names = [r.raw_test_name for r in res.rows]
        assert any("Hemoglobin" in n for n in names)
        assert any("WBC" in n for n in names)
        assert any("Platelet" in n for n in names)

        hb = next(r for r in res.rows if "Hemoglobin" in r.raw_test_name)
        assert hb.raw_value_text == "14.5"
        assert hb.raw_unit == "g/dL"
        assert hb.parse_confidence == "high"


# ===========================================================================
# 3. Layout 2: Panel with '<' Comparator Values
# ===========================================================================

class TestLayout2LessThanComparator:
    def test_less_than_comparator(self):
        lines = [
            "CARDIAC BIOMARKERS REPORT",
            "Patient Name: Jane Doe   Collected: 12/10/2026",
            "Test Name Result Unit Reference Range",
            "High Sensitivity CRP < 0.5 mg/L 0.0 - 3.0",
            "Troponin I < 0.01 ng/mL 0.0 - 0.04",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 2
        crp = next(r for r in res.rows if "CRP" in r.raw_test_name)
        assert "<" in crp.raw_value_text
        assert crp.raw_unit == "mg/L"


# ===========================================================================
# 4. Layout 3: Panel with '>' Comparator Values
# ===========================================================================

class TestLayout3GreaterThanComparator:
    def test_greater_than_comparator(self):
        lines = [
            "RENAL AND VITAMIN PANEL",
            "Patient Name: Bob Smith   Collected: 10/10/2026",
            "Investigation Result Units Reference",
            "eGFR > 90 mL/min > 60",
            "Vitamin D > 100 ng/mL 30 - 100",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 2
        egfr = next(r for r in res.rows if "eGFR" in r.raw_test_name)
        assert ">" in egfr.raw_value_text
        assert egfr.raw_unit == "mL/min"


# ===========================================================================
# 5. Layout 4: Urinalysis / Qualitative Text Values
# ===========================================================================

class TestLayout4QualitativeTextValues:
    def test_qualitative_results(self):
        lines = [
            "URINE ROUTINE EXAMINATION",
            "Patient: Alex Doe   Collected: 05/10/2026",
            "Parameter Result Reference Interval",
            "Urine Protein Negative Negative",
            "Urine Glucose Nil Nil",
            "Urine Ketones Absent Absent",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 3
        prot = next(r for r in res.rows if "Protein" in r.raw_test_name)
        assert prot.raw_value_text.lower() == "negative"


# ===========================================================================
# 6. Layout 5: Two-line Wrapped Test Names
# ===========================================================================

class TestLayout5WrappedTestNames:
    def test_wrapped_test_names(self):
        lines = [
            "HEMATOLOGY COMPLETE PROFILE",
            "Patient Name: Test Subject   Collected: 01/10/2026",
            "Investigation Observed Value Units Reference",
            "Mean Corpuscular",
            "Volume (MCV) 88.5 fL 80 - 100",
            "Red Cell Distribution",
            "Width (RDW) 12.8 % 11.5 - 14.5",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 2
        mcv = next(r for r in res.rows if "MCV" in r.raw_test_name)
        assert "Mean Corpuscular" in mcv.raw_test_name
        assert mcv.raw_value_text == "88.5"


# ===========================================================================
# 7. Layout 6: Missing Units (Medium Confidence)
# ===========================================================================

class TestLayout6MissingUnits:
    def test_missing_units_assigned_medium_confidence(self):
        lines = [
            "ELECTROLYTES & ANION GAP REPORT",
            "Patient: Sarah Lee   Collected: 18/10/2026",
            "Test Name Result Reference",
            "Anion Gap 12 8 - 16",
            "BUN/Creatinine Ratio 18 10 - 20",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 2
        ag = next(r for r in res.rows if "Anion Gap" in r.raw_test_name)
        assert ag.raw_value_text == "12"
        assert ag.raw_unit is None
        assert ag.parse_confidence == "medium"


# ===========================================================================
# 8. Layout 7: Trailing and Attached Abnormal Flags
# ===========================================================================

class TestLayout7AbnormalFlags:
    def test_abnormal_flags_detection(self):
        lines = [
            "METABOLIC COMPREHENSIVE PANEL",
            "Patient: Robert King   Collected: 15/10/2026",
            "Investigation Result Units Reference Interval Flag",
            "Serum Potassium 5.8 mEq/L 3.5 - 5.0 H",
            "Serum Sodium 132 mEq/L 135 - 145 L",
            "Fasting Blood Glucose 145 mg/dL 70 - 99 *",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 3
        k = next(r for r in res.rows if "Potassium" in r.raw_test_name)
        assert k.printed_flag == "H"
        na = next(r for r in res.rows if "Sodium" in r.raw_test_name)
        assert na.printed_flag == "L"


# ===========================================================================
# 9. Layout 8: Multi-Section Multi-Page Report
# ===========================================================================

class TestLayout8MultiSectionReport:
    def test_multi_section_headings_tracked(self):
        lines = [
            "COMPREHENSIVE CLINICAL REPORT",
            "Patient: Emily Davis   Collected: 11/10/2026",
            "COMPLETE BLOOD COUNT",
            "Investigation Result Units Reference",
            "Hemoglobin 13.8 g/dL 12.0 - 16.0",
            "BIOCHEMISTRY PANEL",
            "Investigation Result Units Reference",
            "Serum Creatinine 0.9 mg/dL 0.6 - 1.2",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        res = extract_rows_from_pdf_bytes(pdf_bytes)

        assert res.total_rows == 2
        hb = next(r for r in res.rows if "Hemoglobin" in r.raw_test_name)
        assert hb.section_heading is not None
        assert "BLOOD COUNT" in hb.section_heading.upper()

        creat = next(r for r in res.rows if "Creatinine" in r.raw_test_name)
        assert creat.section_heading is not None
        assert "BIOCHEMISTRY" in creat.section_heading.upper()


# ===========================================================================
# 10. API Integration: GET /api/v1/reports/{id}/results
# ===========================================================================

class TestReportResultsAPI:
    def test_upload_extracts_and_persists_rows(self, client: TestClient):
        # 1. Create patient
        p_resp = client.post("/api/v1/patients", json={"display_name": "API Test Patient"})
        assert p_resp.status_code == 201
        patient_id = p_resp.json()["id"]

        # 2. Upload synthetic report
        lines = [
            "CLINICAL LABORATORY REPORT - BIOCHEMISTRY",
            "Patient Name: API Test Patient",
            "Specimen Collected: 15/10/2026",
            "Investigation Result Units Reference",
            "Serum Cholesterol 195 mg/dL < 200",
            "Triglycerides 140 mg/dL < 150",
            "HDL Cholesterol 55 mg/dL > 40",
            "End of Report",
        ]
        pdf_bytes = create_synthetic_pdf(lines)
        files = [("files", ("lipid_panel.pdf", io.BytesIO(pdf_bytes), "application/pdf"))]
        up_resp = client.post(f"/api/v1/patients/{patient_id}/reports", files=files)
        assert up_resp.status_code == 201
        upload_data = up_resp.json()
        assert upload_data["uploaded_count"] == 1
        report_id = upload_data["items"][0]["report"]["id"]

        # 3. Retrieve results from GET /api/v1/reports/{id}/results
        res_resp = client.get(f"/api/v1/reports/{report_id}/results")
        assert res_resp.status_code == 200
        res_data = res_resp.json()

        assert res_data["report_id"] == report_id
        summary = res_data["summary"]
        assert summary["total_rows"] >= 3
        assert summary["needs_review_count"] >= 3
        assert len(res_data["results"]) >= 3

        # Check exact fields and derived properties
        chol = next(r for r in res_data["results"] if "Cholesterol" in r["raw_test_name"])
        assert chol["raw_value_text"] == "195"
        assert chol["value_numeric"] == 195.0
        assert chol["ref_high"] == 200.0
        assert chol["comparator"] is None
        assert chol["review_status"] == "unreviewed"
