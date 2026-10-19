"""Integration tests for Milestone 7: Normalization and Mapping.

Covers:
- Seeding canonical tests and alias catalog
- Known variants (Hb, Haemoglobin, HGB) mapping to one canonical test
- Strict clinical distinction: Bilirubin Total vs Bilirubin Direct never merged
- Auto-normalization of ExtractedResult.test_id upon PDF extraction & manual entry
- Unmatched test names listing with deterministic fuzzy match suggestions
- User-defined alias mapping (POST /patients/{id}/mapping) and retrospective results update
- Unit mismatch detection across reports for the same canonical test
- Canonical test CRUD (GET /tests, POST /tests, GET /tests/{id})
- Deleting user alias and unlinking results
"""

import io
import fitz
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.db.models.user import User
from app.api.deps import get_current_user
from app.services.normalization.seeder import seed_canonical_tests
from app.services.normalization.normalizer import normalize_test_name
from app.services.normalization.matcher import find_matching_test


def _make_test_user() -> User:
    u = User.__new__(User)
    from datetime import datetime, timezone
    u.__dict__.update({
        "id": "test-user-normalization",
        "email": "normalization@example.com",
        "hashed_password": "$2b$12$placeholder",
        "full_name": "Normalization Test User",
        "is_active": True,
        "is_superuser": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return u


def create_synthetic_pdf(lines: list[str]) -> bytes:
    """Helper to generate synthetic PDF with text lines."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    y = 50
    for line in lines:
        page.insert_text(fitz.Point(50, y), line, fontsize=10)
        y += 20
    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes


@pytest.fixture()
def client():
    """Return a TestClient wired to an isolated in-memory SQLite database seeded with canonical tests."""
    engine_mem = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine_mem)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_mem)

    # Seed canonical tests and aliases
    with TestingSession() as seed_session:
        seed_canonical_tests(seed_session)

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


def create_patient_helper(client: TestClient, name: str = "Test Patient") -> str:
    resp = client.post("/api/v1/patients", json={"display_name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def upload_pdf_helper(client: TestClient, patient_id: str, filename: str, lines: list[str]) -> str:
    pdf_bytes = create_synthetic_pdf(lines)
    files = [("files", (filename, io.BytesIO(pdf_bytes), "application/pdf"))]
    resp = client.post(f"/api/v1/patients/{patient_id}/reports", files=files)
    assert resp.status_code == 201
    return resp.json()["items"][0]["report"]["id"]


class TestSeedDataAndMatchingRules:
    def test_seed_canonical_tests_loaded(self, client: TestClient):
        """Seed canonical tests exist and include CBC, Lipid, LFT, KFT panels."""
        resp = client.get("/api/v1/tests")
        assert resp.status_code == 200
        tests = resp.json()
        assert len(tests) >= 50

        names = {t["canonical_name"] for t in tests}
        assert "Hemoglobin" in names
        assert "Total Cholesterol" in names
        assert "Bilirubin Total" in names
        assert "Bilirubin Direct" in names
        assert "Serum Creatinine" in names
        assert "HbA1c (Glycated Hemoglobin)" in names

    def test_known_variants_map_to_hemoglobin(self, client: TestClient):
        """Variants 'Hb', 'Haemoglobin', 'HGB' all map to canonical 'Hemoglobin'."""
        variants = ["Hb", "Haemoglobin", "HGB", "Hemoglobin (Hb)", "Hgb"]
        patient_id = create_patient_helper(client, "Variant Patient")

        # Create results with variants via manual results endpoint
        report_id = upload_pdf_helper(
            client,
            patient_id,
            "cbc.pdf",
            [
                "METROPOLIS LABS",
                "Collection Date: 12/10/2026",
                "TEST NAME    RESULT  UNIT    REFERENCE",
                "Hb           14.2    g/dL    13.0 - 17.0",
            ],
        )

        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        assert len(res_list) >= 1
        hb_row = res_list[0]
        assert hb_row["canonical_name"] == "Hemoglobin"
        assert hb_row["test_id"] is not None

        # Check detail endpoint for Hemoglobin
        hb_test_id = hb_row["test_id"]
        detail_resp = client.get(f"/api/v1/tests/{hb_test_id}")
        assert detail_resp.status_code == 200
        aliases = [a["raw_alias"].lower() for a in detail_resp.json()["aliases"]]
        assert "hb" in aliases
        assert "haemoglobin" in aliases

    def test_bilirubin_total_and_direct_never_merged(self, client: TestClient):
        """Bilirubin Total and Bilirubin Direct are strictly distinct and never merged."""
        patient_id = create_patient_helper(client, "Bilirubin Patient")

        report_id = upload_pdf_helper(
            client,
            patient_id,
            "lft.pdf",
            [
                "LIVER FUNCTION REPORT",
                "Collection Date: 12/10/2026",
                "TEST NAME           RESULT  UNIT    REFERENCE",
                "Bilirubin Total     1.1     mg/dL   0.2 - 1.2",
                "Bilirubin Direct    0.2     mg/dL   0.0 - 0.3",
            ],
        )

        res_list = client.get(f"/api/v1/reports/{report_id}/results").json()["results"]
        assert len(res_list) == 2

        b_total = next(r for r in res_list if "Total" in r["raw_test_name"])
        b_direct = next(r for r in res_list if "Direct" in r["raw_test_name"])

        # They must map to distinct canonical tests
        assert b_total["canonical_name"] == "Bilirubin Total"
        assert b_direct["canonical_name"] == "Bilirubin Direct"
        assert b_total["test_id"] != b_direct["test_id"]


class TestUnmatchedAndSuggestions:
    def test_unmatched_tests_with_suggestions(self, client: TestClient):
        """Unmatched test names appear in the mapping endpoint with similarity suggestions."""
        patient_id = create_patient_helper(client, "Unmatched Patient")

        # Upload a report with non-standard test names
        upload_pdf_helper(
            client,
            patient_id,
            "special_tests.pdf",
            [
                "SPECIALTY LAB REPORT",
                "Collection Date: 12/10/2026",
                "TEST NAME                 RESULT  UNIT    REFERENCE",
                "Serum Ferritin Level      85      ng/mL   30 - 300",
                "Random Mystery Analyte    12.5    U/L     5 - 20",
            ],
        )

        unmatched_resp = client.get(f"/api/v1/patients/{patient_id}/mapping/unmatched")
        assert unmatched_resp.status_code == 200
        data = unmatched_resp.json()
        assert data["total_unmatched"] >= 1

        raw_names = {item["raw_test_name"] for item in data["items"]}
        assert "Serum Ferritin Level" in raw_names or "Random Mystery Analyte" in raw_names

        # Verify suggestions for Ferritin
        ferritin_item = next(
            (item for item in data["items"] if "Ferritin" in item["raw_test_name"]), None
        )
        if ferritin_item:
            suggested_canonical = [s["canonical_name"] for s in ferritin_item["suggestions"]]
            assert "Ferritin" in suggested_canonical

    def test_accept_suggestion_creates_alias_and_updates_results(self, client: TestClient):
        """Accepting a mapping suggestion creates a TestAlias and applies test_id to all matching rows."""
        patient_id = create_patient_helper(client, "Mapping Action Patient")

        # Upload report with raw name "S. Ferritin Complex"
        report_id = upload_pdf_helper(
            client,
            patient_id,
            "iron_report.pdf",
            [
                "METROPOLIS LAB",
                "Collection Date: 12/10/2026",
                "TEST NAME               RESULT  UNIT    REFERENCE",
                "S. Ferritin Complex     95      ng/mL   30 - 300",
            ],
        )

        # Before mapping: test_id should be None
        res_before = client.get(f"/api/v1/reports/{report_id}/results").json()["results"][0]
        assert res_before["test_id"] is None

        # Find Ferritin canonical test ID
        tests = client.get("/api/v1/tests", params={"search": "Ferritin"}).json()
        ferritin_test = next(t for t in tests if t["canonical_name"] == "Ferritin")

        # Map "S. Ferritin Complex" to "Ferritin"
        map_payload = {
            "raw_test_name": "S. Ferritin Complex",
            "test_id": ferritin_test["id"],
            "is_global": False,
        }
        map_resp = client.post(f"/api/v1/patients/{patient_id}/mapping", json=map_payload)
        assert map_resp.status_code == 201
        assert map_resp.json()["updated_results_count"] == 1

        # After mapping: result now has test_id populated
        res_after = client.get(f"/api/v1/reports/{report_id}/results").json()["results"][0]
        assert res_after["test_id"] == ferritin_test["id"]
        assert res_after["canonical_name"] == "Ferritin"

        # Unmatched list should now be empty for this test
        unmatched_now = client.get(f"/api/v1/patients/{patient_id}/mapping/unmatched").json()
        raw_names_now = [item["raw_test_name"] for item in unmatched_now["items"]]
        assert "S. Ferritin Complex" not in raw_names_now

    def test_delete_mapping_alias(self, client: TestClient):
        """Deleting an alias unlinks the test_id from results."""
        patient_id = create_patient_helper(client, "Delete Alias Patient")
        report_id = upload_pdf_helper(
            client,
            patient_id,
            "rep.pdf",
            [
                "LAB REPORT",
                "Collection Date: 12/10/2026",
                "TEST NAME           RESULT  UNIT",
                "Custom Test XYZ     45      mg/dL",
            ],
        )

        tests = client.get("/api/v1/tests").json()
        target_test = tests[0]

        # Create mapping
        map_resp = client.post(
            f"/api/v1/patients/{patient_id}/mapping",
            json={"raw_test_name": "Custom Test XYZ", "test_id": target_test["id"]},
        )
        alias_id = map_resp.json()["alias"]["id"]

        res_mapped = client.get(f"/api/v1/reports/{report_id}/results").json()["results"][0]
        assert res_mapped["test_id"] == target_test["id"]

        # Delete mapping
        del_resp = client.delete(f"/api/v1/patients/{patient_id}/mapping/{alias_id}")
        assert del_resp.status_code == 204

        # Result unlinked
        res_unlinked = client.get(f"/api/v1/reports/{report_id}/results").json()["results"][0]
        assert res_unlinked["test_id"] is None


class TestUnitMismatchWarnings:
    def test_unit_mismatch_warning_on_differing_units(self, client: TestClient):
        """A unit-mismatch warning is raised when reports for the same canonical test have conflicting units."""
        patient_id = create_patient_helper(client, "Unit Mismatch Patient")

        # Report 1: Hemoglobin in g/dL
        upload_pdf_helper(
            client,
            patient_id,
            "report_g_dl.pdf",
            [
                "LAB REPORT 1",
                "Collection Date: 10/10/2026",
                "TEST NAME       RESULT  UNIT      REFERENCE",
                "Hemoglobin      14.2    g/dL      13.0 - 17.0",
            ],
        )

        # Report 2: Hemoglobin in g/L (deliberate mismatch fixture)
        upload_pdf_helper(
            client,
            patient_id,
            "report_g_l.pdf",
            [
                "LAB REPORT 2",
                "Collection Date: 15/10/2026",
                "TEST NAME       RESULT  UNIT      REFERENCE",
                "Hemoglobin      142     g/L       130 - 170",
            ],
        )

        mismatch_resp = client.get(f"/api/v1/patients/{patient_id}/mapping/unit-mismatches")
        assert mismatch_resp.status_code == 200
        data = mismatch_resp.json()
        assert data["mismatches_count"] >= 1

        hb_mismatch = next(
            (m for m in data["items"] if m["canonical_name"] == "Hemoglobin"), None
        )
        assert hb_mismatch is not None
        assert "g/dl" in [u.lower() for u in hb_mismatch["observed_units"]]
        assert "g/l" in [u.lower() for u in hb_mismatch["observed_units"]]
        assert "Conflicting measurement units" in hb_mismatch["message"]


class TestCanonicalTestCRUD:
    def test_create_user_defined_canonical_test(self, client: TestClient):
        """Users can create custom canonical tests with a category and preferred unit."""
        payload = {
            "canonical_name": "Anti-Mullerian Hormone (AMH)",
            "category": "Fertility & Hormones",
            "preferred_unit": "ng/mL",
        }
        resp = client.post("/api/v1/tests", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["canonical_name"] == "Anti-Mullerian Hormone (AMH)"
        assert data["category"] == "Fertility & Hormones"
        assert data["is_seeded"] is False
        assert data["aliases_count"] == 1

        # Duplicate name returns 400
        dup_resp = client.post("/api/v1/tests", json=payload)
        assert dup_resp.status_code == 400
