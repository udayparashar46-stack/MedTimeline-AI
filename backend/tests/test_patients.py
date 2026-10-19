"""Integration tests for the /api/v1/patients endpoints.

Each test uses its own in-memory SQLite database so tests are fully
isolated and do not touch the real data/ folder.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db


# ---------------------------------------------------------------------------
# Per-test in-memory database fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    """Return a TestClient wired to a fresh in-memory SQLite database."""
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


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def create_demo_patient(client: TestClient, name: str = "Demo Patient") -> dict:
    resp = client.post("/api/v1/patients", json={"display_name": name})
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestListPatients:
    def test_empty_list(self, client: TestClient) -> None:
        """Empty workspace returns an empty list, not a 404."""
        resp = client.get("/api/v1/patients")
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0

    def test_list_after_create(self, client: TestClient) -> None:
        create_demo_patient(client, "Alice")
        create_demo_patient(client, "Bob")
        resp = client.get("/api/v1/patients")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_search_filter(self, client: TestClient) -> None:
        create_demo_patient(client, "Alice")
        create_demo_patient(client, "Bob")
        resp = client.get("/api/v1/patients", params={"search": "alice"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["display_name"] == "Alice"


class TestCreatePatient:
    def test_create_minimal(self, client: TestClient) -> None:
        resp = client.post("/api/v1/patients", json={"display_name": "Test Patient"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["display_name"] == "Test Patient"
        assert "id" in body
        assert body["date_of_birth"] is None
        assert body["sex"] is None

    def test_create_full(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/patients",
            json={
                "display_name": "Jane Doe",
                "date_of_birth": "1985-03-15",
                "sex": "female",
                "notes": "Chronic condition tracking",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["date_of_birth"] == "1985-03-15"
        assert body["sex"] == "female"

    def test_create_blank_name_rejected(self, client: TestClient) -> None:
        resp = client.post("/api/v1/patients", json={"display_name": "   "})
        assert resp.status_code == 422

    def test_create_invalid_dob_rejected(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/patients",
            json={"display_name": "Test", "date_of_birth": "15-03-1985"},
        )
        assert resp.status_code == 422

    def test_create_invalid_sex_rejected(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/patients",
            json={"display_name": "Test", "sex": "unknown_value"},
        )
        assert resp.status_code == 422


class TestGetPatient:
    def test_get_existing(self, client: TestClient) -> None:
        created = create_demo_patient(client, "Alice")
        resp = client.get(f"/api/v1/patients/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Alice"

    def test_get_nonexistent_returns_404(self, client: TestClient) -> None:
        resp = client.get("/api/v1/patients/nonexistent-id")
        assert resp.status_code == 404


class TestUpdatePatient:
    def test_rename(self, client: TestClient) -> None:
        created = create_demo_patient(client, "Old Name")
        resp = client.patch(
            f"/api/v1/patients/{created['id']}",
            json={"display_name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "New Name"

    def test_update_nonexistent_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            "/api/v1/patients/bad-id",
            json={"display_name": "X"},
        )
        assert resp.status_code == 404


class TestDeletePatient:
    def test_delete_removes_from_list(self, client: TestClient) -> None:
        created = create_demo_patient(client, "To Delete")
        resp = client.delete(f"/api/v1/patients/{created['id']}")
        assert resp.status_code == 204
        # Should no longer appear in list
        list_resp = client.get("/api/v1/patients")
        assert list_resp.json()["total"] == 0

    def test_delete_then_get_returns_404(self, client: TestClient) -> None:
        created = create_demo_patient(client)
        client.delete(f"/api/v1/patients/{created['id']}")
        resp = client.get(f"/api/v1/patients/{created['id']}")
        assert resp.status_code == 404

    def test_delete_nonexistent_returns_404(self, client: TestClient) -> None:
        resp = client.delete("/api/v1/patients/nonexistent-id")
        assert resp.status_code == 404
