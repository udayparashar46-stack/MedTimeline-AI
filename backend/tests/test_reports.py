"""Integration tests for M3 PDF Upload & Secure Storage.

Tests acceptance criteria from docs/PLAN.md Section 11 (M3):
1. Multi-file upload with live status
2. Rejection of renamed non-PDF files and corrupt/empty files
3. Rejection of oversized files (> 20 MB)
4. Per-patient SHA-256 duplicate detection (warns and skips)
5. Files stored on disk using random UUID names, outside public paths
6. Report listing per patient workspace
7. Report deletion and patient cascade deletion removing files from disk
"""

import tempfile
import fitz
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.services.storage import storage_service


def create_synthetic_pdf(text: str = "Sample Lab Report - Fictional Data") -> bytes:
    """Generate minimal valid synthetic PDF bytes in memory."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.fixture()
def test_env():
    """Set up an isolated in-memory DB and temporary upload directory."""
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
    with TestClient(app) as client:
        yield client, temp_dir.name
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)

    storage_service.upload_dir = orig_upload_dir
    temp_dir.cleanup()


def create_patient(client: TestClient, name: str = "Test Patient") -> str:
    resp = client.post("/api/v1/patients", json={"display_name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


class TestReportUploadValidation:
    def test_upload_valid_single_pdf(self, test_env) -> None:
        client, upload_dir = test_env
        patient_id = create_patient(client, "Sarah")

        pdf_bytes = create_synthetic_pdf("Hemoglobin: 14.2 g/dL")
        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("blood_test.pdf", pdf_bytes, "application/pdf"))],
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["uploaded_count"] == 1
        assert data["skipped_count"] == 0
        assert data["failed_count"] == 0
        assert len(data["items"]) == 1

        item = data["items"][0]
        assert item["status"] == "uploaded"
        assert item["filename"] == "blood_test.pdf"
        assert item["report"]["patient_id"] == patient_id
        assert item["report"]["page_count"] == 1
        assert item["report"]["status"] == "needs_review"
        assert len(item["report"]["file_sha256"]) == 64

        # Verify disk file uses a UUID name, NOT original filename
        stored_path = storage_service.get_file_path(item["report"]["file_path"])
        assert stored_path is not None
        assert stored_path.exists()
        assert "blood_test.pdf" not in str(stored_path)
        assert stored_path.suffix == ".pdf"

    def test_reject_renamed_text_file(self, test_env) -> None:
        """A renamed .txt file with .pdf extension must be rejected."""
        client, _ = test_env
        patient_id = create_patient(client)

        fake_pdf = b"This is just plain text, not a real PDF file."
        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("fake_report.pdf", fake_pdf, "application/pdf"))],
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["uploaded_count"] == 0
        assert data["failed_count"] == 1
        assert "Missing %PDF header" in data["items"][0]["message"]

    def test_reject_empty_file(self, test_env) -> None:
        client, _ = test_env
        patient_id = create_patient(client)

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("empty.pdf", b"", "application/pdf"))],
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["failed_count"] == 1
        assert "empty" in data["items"][0]["message"].lower()

    def test_reject_non_pdf_extension(self, test_env) -> None:
        client, _ = test_env
        patient_id = create_patient(client)

        pdf_bytes = create_synthetic_pdf()
        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("document.docx", pdf_bytes, "application/octet-stream"))],
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["failed_count"] == 1
        assert ".pdf" in data["items"][0]["message"]

    def test_reject_oversized_file(self, test_env, monkeypatch) -> None:
        """Verify files over max limit are rejected."""
        client, _ = test_env
        patient_id = create_patient(client)

        # Temporarily set max limit to 100 bytes to test limit enforcement
        monkeypatch.setattr(settings, "MAX_FILE_SIZE_BYTES", 100)

        pdf_bytes = create_synthetic_pdf()
        assert len(pdf_bytes) > 100

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("large_report.pdf", pdf_bytes, "application/pdf"))],
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["failed_count"] == 1
        assert "exceeds maximum allowed size" in data["items"][0]["message"]


class TestDuplicateDetection:
    def test_upload_duplicate_file_warns_and_skips(self, test_env) -> None:
        client, _ = test_env
        patient_id = create_patient(client, "Robert")

        pdf_bytes = create_synthetic_pdf("Lipid Panel - Total Cholesterol: 188")

        # First upload: succeeds
        resp1 = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("lipid_report.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp1.status_code == 201
        assert resp1.json()["uploaded_count"] == 1

        # Second upload of the EXACT same file content: warns and skips
        resp2 = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("lipid_report_copy.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp2.status_code == 201
        data2 = resp2.json()
        assert data2["uploaded_count"] == 0
        assert data2["skipped_count"] == 1
        assert data2["items"][0]["status"] == "duplicate_skipped"
        assert "Duplicate skipped" in data2["items"][0]["message"]

        # Verify only 1 report exists in the list
        list_resp = client.get(f"/api/v1/patients/{patient_id}/reports")
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 1

    def test_same_file_in_different_patient_workspace_is_allowed(self, test_env) -> None:
        client, _ = test_env
        patient1 = create_patient(client, "Patient A")
        patient2 = create_patient(client, "Patient B")

        pdf_bytes = create_synthetic_pdf("CBC standard")

        resp1 = client.post(
            f"/api/v1/patients/{patient1}/reports",
            files=[("files", ("cbc.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp1.status_code == 201
        assert resp1.json()["uploaded_count"] == 1

        resp2 = client.post(
            f"/api/v1/patients/{patient2}/reports",
            files=[("files", ("cbc.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp2.status_code == 201
        assert resp2.json()["uploaded_count"] == 1


class TestBatchUploadAndListing:
    def test_multi_pdf_upload(self, test_env) -> None:
        client, _ = test_env
        patient_id = create_patient(client, "Batch Patient")

        file1 = create_synthetic_pdf("Report 1 - CBC")
        file2 = create_synthetic_pdf("Report 2 - Metabolic")
        file3 = create_synthetic_pdf("Report 3 - Urinalysis")

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[
                ("files", ("cbc.pdf", file1, "application/pdf")),
                ("files", ("metabolic.pdf", file2, "application/pdf")),
                ("files", ("urinalysis.pdf", file3, "application/pdf")),
            ],
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["uploaded_count"] == 3
        assert data["skipped_count"] == 0
        assert data["failed_count"] == 0

        # List reports
        list_resp = client.get(f"/api/v1/patients/{patient_id}/reports")
        assert list_resp.status_code == 200
        list_data = list_resp.json()
        assert list_data["total"] == 3
        filenames = {r["original_filename"] for r in list_data["items"]}
        assert filenames == {"cbc.pdf", "metabolic.pdf", "urinalysis.pdf"}


class TestReportDeletion:
    def test_delete_individual_report(self, test_env) -> None:
        client, _ = test_env
        patient_id = create_patient(client)

        pdf_bytes = create_synthetic_pdf("To be deleted")
        upload_resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("temp.pdf", pdf_bytes, "application/pdf"))],
        )
        report_id = upload_resp.json()["items"][0]["report"]["id"]
        storage_key = upload_resp.json()["items"][0]["report"]["file_path"]

        # Confirm file exists on disk
        file_path = storage_service.get_file_path(storage_key)
        assert file_path is not None and file_path.exists()

        # Delete report
        del_resp = client.delete(f"/api/v1/reports/{report_id}")
        assert del_resp.status_code == 204

        # Confirm report is gone from list
        list_resp = client.get(f"/api/v1/patients/{patient_id}/reports")
        assert list_resp.json()["total"] == 0

        # Confirm file on disk is removed
        assert not file_path.exists()

    def test_delete_patient_removes_reports_and_files(self, test_env) -> None:
        client, _ = test_env
        patient_id = create_patient(client, "Patient To Delete")

        pdf_bytes = create_synthetic_pdf("Patient file")
        upload_resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("report.pdf", pdf_bytes, "application/pdf"))],
        )
        storage_key = upload_resp.json()["items"][0]["report"]["file_path"]
        file_path = storage_service.get_file_path(storage_key)
        assert file_path is not None and file_path.exists()

        # Delete patient workspace
        del_resp = client.delete(f"/api/v1/patients/{patient_id}")
        assert del_resp.status_code == 204

        # Disk file must be removed
        assert not file_path.exists()
