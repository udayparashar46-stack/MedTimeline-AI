"""Unit and integration tests for Milestone 12 (Audit Trail, Data Portability, System Reset).

Acceptance criteria tested:
- Non-clinical audit event logging on lifecycle events (patient create/update/delete, exports).
- Strict privacy verification: Audit trail never logs clinical/laboratory test values.
- System Reset / "Delete Everything" cascade requires exact typed confirmation: "DELETE EVERYTHING".
- System Reset permanently purges all database rows across patients, reports, results, and files.
- Default canonical tests are re-seeded after system reset so app remains usable.
- Workspace data portability archive export (JSON backup) and import (restoration).
"""

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
from app.db.models.audit_event import AuditEvent


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


class TestAuditAndReset:
    def test_audit_event_logged_on_patient_create_and_delete(self, client):
        c, TestingSession = client

        # 1. Create a patient
        resp = c.post("/api/v1/patients", json={"display_name": "Audit Patient", "sex": "male"})
        assert resp.status_code == 201
        patient_id = resp.json()["id"]

        # 2. Check audit events endpoint
        audit_resp = c.get(f"/api/v1/audit-events?patient_id={patient_id}")
        assert audit_resp.status_code == 200
        items = audit_resp.json()["items"]
        assert len(items) >= 1
        assert any(item["event_type"] == "patient_created" for item in items)

        # Verify no medical values in audit items
        for item in items:
            assert "hemoglobin" not in (item["details"] or "").lower()
            assert "creatinine" not in (item["details"] or "").lower()

        # 3. Delete patient
        del_resp = c.delete(f"/api/v1/patients/{patient_id}")
        assert del_resp.status_code == 204

        # 4. Check deletion was logged
        audit_resp2 = c.get(f"/api/v1/audit-events?patient_id={patient_id}")
        assert audit_resp2.status_code == 200
        items2 = audit_resp2.json()["items"]
        assert any(item["event_type"] == "patient_deleted" for item in items2)

    def test_audit_event_logged_on_exports(self, client):
        c, TestingSession = client

        # Setup patient and report
        with TestingSession() as db:
            patient = Patient(id="audit-exp-p1", display_name="Export Patient")
            db.add(patient)
            report = Report(
                id="audit-exp-r1",
                patient_id="audit-exp-p1",
                original_filename="lab1.pdf",
                file_path="/tmp/f1.pdf",
                file_sha256="sha-audit-1",
                status="reviewed",
                report_date="2026-05-10",
                report_date_confirmed=True,
            )
            db.add(report)
            test = Test(id="audit-test-1", canonical_name="Calcium", category="Biochemistry")
            db.add(test)
            res = ExtractedResult(
                id="audit-res-1",
                report_id="audit-exp-r1",
                page_number=1,
                row_order=1,
                raw_test_name="Calcium",
                raw_value_text="9.5",
                raw_unit="mg/dL",
                source_snippet="Calcium 9.5 mg/dL",
                test_id="audit-test-1",
                review_status="confirmed",
                parse_confidence="high",
            )
            db.add(res)
            db.commit()

        # Trigger CSV export
        c.get("/api/v1/patients/audit-exp-p1/export/csv")
        # Trigger PDF export
        c.get("/api/v1/patients/audit-exp-p1/export/pdf")

        # Check audit trail
        audit_resp = c.get("/api/v1/audit-events?patient_id=audit-exp-p1")
        assert audit_resp.status_code == 200
        event_types = [item["event_type"] for item in audit_resp.json()["items"]]
        assert "timeline_exported_csv" in event_types
        assert "timeline_exported_pdf" in event_types

    def test_system_reset_requires_exact_confirmation(self, client):
        c, _ = client
        # Bad confirm strings
        resp1 = c.post("/api/v1/system/reset", json={"confirm": "yes"})
        assert resp1.status_code == 400

        resp2 = c.post("/api/v1/system/reset", json={"confirm": "delete everything"})
        assert resp2.status_code == 400

        resp3 = c.post("/api/v1/system/reset", json={"confirm": "DELETE"})
        assert resp3.status_code == 400

    def test_system_reset_purges_all_data(self, client):
        c, TestingSession = client

        # Populate database with patient, reports, results, and aliases
        with TestingSession() as db:
            p1 = Patient(id="reset-p1", display_name="Patient to Erase")
            db.add(p1)
            r1 = Report(
                id="reset-r1",
                patient_id="reset-p1",
                original_filename="wipe_me.pdf",
                file_path="/tmp/wipe.pdf",
                file_sha256="sha-wipe",
                status="reviewed",
            )
            db.add(r1)
            res1 = ExtractedResult(
                id="reset-res1",
                report_id="reset-r1",
                page_number=1,
                row_order=1,
                raw_test_name="Potassium",
                raw_value_text="4.2",
                source_snippet="Potassium 4.2",
                review_status="confirmed",
                parse_confidence="high",
            )
            db.add(res1)
            db.commit()

        # Check patient exists
        assert c.get("/api/v1/patients/reset-p1").status_code == 200

        # Execute system reset
        reset_resp = c.post("/api/v1/system/reset", json={"confirm": "DELETE EVERYTHING"})
        assert reset_resp.status_code == 200
        body = reset_resp.json()
        assert body["status"] == "reset_complete"
        assert body["patients_deleted"] >= 1
        assert body["reports_deleted"] >= 1
        assert body["results_deleted"] >= 1

        # Check patient is gone
        assert c.get("/api/v1/patients/reset-p1").status_code == 404
        # Check patient list is empty
        list_resp = c.get("/api/v1/patients")
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 0

        # Check canonical tests were re-seeded so app is immediately usable
        tests_resp = c.get("/api/v1/tests")
        assert tests_resp.status_code == 200
        assert len(tests_resp.json()) > 0

    def test_workspace_archive_export_and_import(self, client):
        c, TestingSession = client

        # 1. Setup patient with report and result
        with TestingSession() as db:
            patient = Patient(
                id="archive-p1",
                display_name="Portable Patient",
                date_of_birth="1992-04-14",
                sex="female",
                notes="Portable archive test",
            )
            db.add(patient)
            rep = Report(
                id="archive-r1",
                patient_id="archive-p1",
                original_filename="cbc.pdf",
                file_path="/tmp/cbc.pdf",
                file_sha256="sha-cbc-arch",
                page_count=2,
                status="reviewed",
                report_date="2026-07-20",
                report_date_confirmed=True,
                lab_name="Portable Lab",
            )
            db.add(rep)
            t = Test(id="t-arch-1", canonical_name="Hemoglobin", category="Complete Blood Count")
            db.add(t)
            res = ExtractedResult(
                id="archive-res1",
                report_id="archive-r1",
                page_number=1,
                row_order=1,
                raw_test_name="Hemoglobin",
                raw_value_text="14.0",
                raw_unit="g/dL",
                source_snippet="Hemoglobin 14.0 g/dL",
                test_id="t-arch-1",
                review_status="confirmed",
                parse_confidence="high",
            )
            db.add(res)
            alias = TestAlias(
                id="alias-arch-1",
                test_id="t-arch-1",
                alias_normalized="hb",
                raw_alias="Hb",
                source="user",
                patient_id="archive-p1",
            )
            db.add(alias)
            db.commit()

        # 2. Export archive
        export_resp = c.get("/api/v1/patients/archive-p1/export/archive")
        assert export_resp.status_code == 200
        archive_data = export_resp.json()
        assert archive_data["archive_type"] == "patient_workspace_backup"
        assert archive_data["patient"]["display_name"] == "Portable Patient"
        assert len(archive_data["reports"]) == 1
        assert len(archive_data["extracted_results"]) == 1
        assert len(archive_data["custom_aliases"]) == 1

        # 3. Simulate restoring to a fresh workspace or different ID
        archive_data["patient"]["id"] = "archive-p2"
        archive_data["patient"]["display_name"] = "Restored Patient"
        archive_data["reports"][0]["id"] = "archive-r2"
        archive_data["extracted_results"][0]["id"] = "archive-res2"
        archive_data["extracted_results"][0]["report_id"] = "archive-r2"
        archive_data["custom_aliases"][0]["id"] = "alias-arch-2"

        import_resp = c.post("/api/v1/patients/import/archive", json=archive_data)
        assert import_resp.status_code == 200
        assert import_resp.json()["status"] == "imported"
        assert import_resp.json()["reports_restored"] == 1
        assert import_resp.json()["results_restored"] == 1

        # Check restored patient can be fetched
        get_restored = c.get("/api/v1/patients/archive-p2")
        assert get_restored.status_code == 200
        assert get_restored.json()["display_name"] == "Restored Patient"
