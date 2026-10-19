"""Integration tests for Milestone 6: Review and Correction UI backend.

Covers:
- Editing result fields (test name, value, unit, reference interval, flag)
- Immutability of raw_* columns in ExtractedResult
- ResultEdit audit log creation and chronological tracking
- Confirming and rejecting rows
- Undoing edits and restoring previous effective values and status
- Bulk confirmation of high-confidence rows and explicit result IDs
- Manual row creation (POST /reports/{id}/results)
- Report date confirmation gating: cannot mark report "reviewed" without confirmed date
- Streaming PDF for split-view interface (GET /reports/{id}/file)
- Input validation (invalid review_status returns 422)
"""

import io
import json
import pytest
import fitz
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.services.storage import storage_service


def create_synthetic_pdf() -> bytes:
    """Generate a clean synthetic PDF for test uploads."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    lines = [
        "METROPOLIS HEALTHCARE LAB REPORT",
        "Collected Date: 14/10/2024",
        "Patient: Test Patient",
        "TEST NAME       RESULT   UNIT      REFERENCE",
        "Hemoglobin      14.2     g/dL      13.0 - 17.0",
        "Total WBC       8500     cells/mcL 4000 - 11000",
        "Fasting Glucose 105      mg/dL     70 - 99        H",
    ]
    y = 50
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
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)


def upload_report_helper(client: TestClient) -> tuple[str, str]:
    """Helper to create a patient, upload a report, and return (patient_id, report_id)."""
    p_resp = client.post("/api/v1/patients", json={"display_name": "Review Test Patient"})
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["id"]

    pdf_bytes = create_synthetic_pdf()
    files = [("files", ("review_report.pdf", io.BytesIO(pdf_bytes), "application/pdf"))]
    up_resp = client.post(f"/api/v1/patients/{patient_id}/reports", files=files)
    assert up_resp.status_code == 201
    report_id = up_resp.json()["items"][0]["report"]["id"]
    return patient_id, report_id


class TestResultRowEditingAndAuditLog:
    def test_edit_value_and_audit_log(self, client: TestClient):
        """Editing value_text updates effective_value_text, leaves raw_value_text intact, and writes ResultEdit."""
        _, report_id = upload_report_helper(client)

        # Get results
        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        assert len(res_list) >= 1
        first_row = res_list[0]
        result_id = first_row["id"]
        original_raw_val = first_row["raw_value_text"]

        # Edit the row
        edit_payload = {
            "value_text": "15.0",
            "test_name": "Corrected Hb",
        }
        patch_resp = client.patch(f"/api/v1/results/{result_id}", json=edit_payload)
        assert patch_resp.status_code == 200
        updated = patch_resp.json()

        # Effective values updated
        assert updated["effective_value_text"] == "15.0"
        assert updated["effective_test_name"] == "Corrected Hb"
        assert updated["value_numeric"] == 15.0

        # Raw values remain completely unchanged!
        assert updated["raw_value_text"] == original_raw_val
        assert updated["raw_test_name"] == first_row["raw_test_name"]

        # Status automatically set to "edited"
        assert updated["review_status"] == "edited"
        assert updated["has_edits"] is True
        assert len(updated["edits"]) == 3  # value_text, test_name, and review_status

        fields_edited = {e["field"] for e in updated["edits"]}
        assert "raw_value_text" in fields_edited
        assert "raw_test_name" in fields_edited
        assert "review_status" in fields_edited

    def test_confirm_and_reject_status(self, client: TestClient):
        """Confirming and rejecting rows updates review_status and records audit log."""
        _, report_id = upload_report_helper(client)
        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        r1_id = res_list[0]["id"]
        r2_id = res_list[1]["id"]

        # Confirm first row
        conf_resp = client.patch(f"/api/v1/results/{r1_id}", json={"review_status": "confirmed"})
        assert conf_resp.status_code == 200
        assert conf_resp.json()["review_status"] == "confirmed"
        assert conf_resp.json()["has_edits"] is True

        # Reject second row
        rej_resp = client.patch(f"/api/v1/results/{r2_id}", json={"review_status": "rejected"})
        assert rej_resp.status_code == 200
        assert rej_resp.json()["review_status"] == "rejected"

    def test_invalid_review_status_rejected(self, client: TestClient):
        """Invalid review_status values return 422 Unprocessable Entity."""
        _, report_id = upload_report_helper(client)
        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        r_id = res_list[0]["id"]

        resp = client.patch(f"/api/v1/results/{r_id}", json={"review_status": "invalid_status"})
        assert resp.status_code == 422


class TestUndoResultEdit:
    def test_undo_reverts_last_edit(self, client: TestClient):
        """Undo removes the most recent ResultEdit and restores the previous effective value."""
        _, report_id = upload_report_helper(client)
        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        r_id = res_list[0]["id"]

        # Edit unit
        client.patch(f"/api/v1/results/{r_id}", json={"unit": "mmol/L"})

        # Edit again: change value_text
        client.patch(f"/api/v1/results/{r_id}", json={"value_text": "99.9"})

        current = client.get(f"/api/v1/reports/{report_id}/results").json()["results"][0]
        assert current["effective_value_text"] == "99.9"
        assert current["effective_unit"] == "mmol/L"

        # Undo the value_text edit
        undo_resp = client.post(f"/api/v1/results/{r_id}/undo")
        assert undo_resp.status_code == 200
        reverted = undo_resp.json()
        assert reverted["effective_value_text"] == current["raw_value_text"]
        assert reverted["effective_unit"] == "mmol/L"

        # Undo unit edit
        client.post(f"/api/v1/results/{r_id}/undo")
        reverted2 = client.post(f"/api/v1/results/{r_id}/undo").json()
        # When all edits undone, review_status reverts to unreviewed
        assert reverted2["review_status"] == "unreviewed"
        assert reverted2["has_edits"] is False

    def test_undo_with_no_edits_returns_400(self, client: TestClient):
        """Attempting to undo an unedited row returns 400 Bad Request."""
        _, report_id = upload_report_helper(client)
        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        r_id = res_list[0]["id"]

        resp = client.post(f"/api/v1/results/{r_id}/undo")
        assert resp.status_code == 400
        assert "No edits to undo" in resp.json()["detail"]


class TestBulkConfirm:
    def test_bulk_confirm_by_confidence(self, client: TestClient):
        """Bulk confirm can confirm all high-confidence rows in a report."""
        _, report_id = upload_report_helper(client)

        resp = client.post(
            "/api/v1/results/bulk-confirm",
            json={"report_id": report_id, "confidence": "high"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["confirmed_count"] >= 1
        for r in data["results"]:
            assert r["review_status"] == "confirmed"

    def test_bulk_confirm_by_id_list(self, client: TestClient):
        """Bulk confirm can confirm an explicit list of result IDs."""
        _, report_id = upload_report_helper(client)
        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        ids_to_confirm = [res_list[0]["id"]]

        resp = client.post(
            "/api/v1/results/bulk-confirm",
            json={"report_id": report_id, "result_ids": ids_to_confirm},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["confirmed_count"] == 1
        assert data["results"][0]["id"] == ids_to_confirm[0]
        assert data["results"][0]["review_status"] == "confirmed"


class TestManualResultCreation:
    def test_add_manual_result(self, client: TestClient):
        """POST /reports/{id}/results creates a valid manual row with review_status='manual'."""
        _, report_id = upload_report_helper(client)

        payload = {
            "page_number": 1,
            "test_name": "Serum Creatinine",
            "value_text": "1.1",
            "unit": "mg/dL",
            "reference_text": "0.7 - 1.3",
            "printed_flag": None,
            "section_heading": "Renal Function",
        }
        resp = client.post(f"/api/v1/reports/{report_id}/results", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["effective_test_name"] == "Serum Creatinine"
        assert data["effective_value_text"] == "1.1"
        assert data["value_numeric"] == 1.1
        assert data["ref_low"] == 0.7
        assert data["ref_high"] == 1.3
        assert data["review_status"] == "manual"
        assert data["parse_confidence"] == "high"


class TestReportDateConfirmationGating:
    def test_cannot_mark_reviewed_without_confirmed_date(self, client: TestClient):
        """Attempting to transition report to 'reviewed' status without confirming report date raises 400."""
        _, report_id = upload_report_helper(client)

        # Ensure report_date_confirmed is False initially
        report = client.get(f"/api/v1/reports/{report_id}").json()
        assert report["report_date_confirmed"] is False

        # Attempt to mark reviewed
        resp = client.patch(f"/api/v1/reports/{report_id}", json={"status": "reviewed"})
        assert resp.status_code == 400
        assert "collection date must be confirmed" in resp.json()["detail"]

    def test_can_mark_reviewed_after_confirming_date(self, client: TestClient):
        """Once report date is confirmed, marking report as 'reviewed' succeeds."""
        _, report_id = upload_report_helper(client)

        # Confirm the date first
        date_resp = client.patch(
            f"/api/v1/reports/{report_id}",
            json={"report_date_confirmed": True},
        )
        assert date_resp.status_code == 200
        assert date_resp.json()["report_date_confirmed"] is True

        # Now mark as reviewed
        rev_resp = client.patch(f"/api/v1/reports/{report_id}", json={"status": "reviewed"})
        assert rev_resp.status_code == 200
        assert rev_resp.json()["status"] == "reviewed"

    def test_can_mark_reviewed_and_confirm_date_simultaneously(self, client: TestClient):
        """Can confirm date and mark reviewed in the same PATCH request."""
        _, report_id = upload_report_helper(client)

        resp = client.patch(
            f"/api/v1/reports/{report_id}",
            json={"status": "reviewed", "report_date_confirmed": True},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "reviewed"
        assert resp.json()["report_date_confirmed"] is True


class TestReportPdfFileStreaming:
    def test_stream_pdf_file_success(self, client: TestClient):
        """GET /reports/{id}/file successfully streams the uploaded PDF."""
        _, report_id = upload_report_helper(client)

        resp = client.get(f"/api/v1/reports/{report_id}/file")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert len(resp.content) > 0
        assert resp.content.startswith(b"%PDF-")

    def test_stream_pdf_nonexistent_report_returns_404(self, client: TestClient):
        """GET /reports/{id}/file for a non-existent report returns 404."""
        resp = client.get("/api/v1/reports/nonexistent-report-id/file")
        assert resp.status_code == 404
