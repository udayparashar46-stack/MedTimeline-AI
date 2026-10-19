"""Authentication API tests — register, login, token validation, workspace isolation."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db


@pytest.fixture()
def auth_client():
    """TestClient wired to fresh in-memory DB. Auth dependencies are NOT bypassed here —
    we need real JWT flow to test auth. The get_db override gives a clean in-memory DB."""
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

    # Only override get_db, NOT get_current_user — auth must run for real
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)


class TestRegistration:
    def test_register_creates_user_and_returns_token(self, auth_client: TestClient) -> None:
        resp = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "alice@example.com", "password": "AlicePass123", "full_name": "Alice"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["email"] == "alice@example.com"

    def test_register_duplicate_email_rejected(self, auth_client: TestClient) -> None:
        auth_client.post(
            "/api/v1/auth/register",
            json={"email": "alice@example.com", "password": "AlicePass123"},
        )
        resp = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "alice@example.com", "password": "AnotherPass456"},
        )
        assert resp.status_code == 400

    def test_register_short_password_rejected(self, auth_client: TestClient) -> None:
        resp = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "bob@example.com", "password": "short"},
        )
        assert resp.status_code == 422

    def test_register_invalid_email_rejected(self, auth_client: TestClient) -> None:
        resp = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "not-an-email", "password": "ValidPass123"},
        )
        assert resp.status_code == 422


class TestLogin:
    def test_login_returns_token(self, auth_client: TestClient) -> None:
        auth_client.post(
            "/api/v1/auth/register",
            json={"email": "bob@example.com", "password": "BobPass123"},
        )
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "bob@example.com", "password": "BobPass123"},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password_rejected(self, auth_client: TestClient) -> None:
        auth_client.post(
            "/api/v1/auth/register",
            json={"email": "carol@example.com", "password": "CarolPass123"},
        )
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "carol@example.com", "password": "WrongPassword"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user_rejected(self, auth_client: TestClient) -> None:
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "ghost@example.com", "password": "GhostPass123"},
        )
        assert resp.status_code == 401


class TestProtectedEndpoints:
    def test_patients_endpoint_requires_auth(self, auth_client: TestClient) -> None:
        """Accessing /patients without a token must return 401."""
        resp = auth_client.get("/api/v1/patients")
        assert resp.status_code == 401

    def test_patients_endpoint_with_valid_token(self, auth_client: TestClient) -> None:
        """Accessing /patients with a valid JWT must succeed."""
        reg = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "dave@example.com", "password": "DavePass123"},
        )
        token = reg.json()["access_token"]
        resp = auth_client.get(
            "/api/v1/patients",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_invalid_token_rejected(self, auth_client: TestClient) -> None:
        """A tampered or fake token returns 401."""
        resp = auth_client.get(
            "/api/v1/patients",
            headers={"Authorization": "Bearer fake.token.value"},
        )
        assert resp.status_code == 401

    def test_audit_events_requires_auth(self, auth_client: TestClient) -> None:
        resp = auth_client.get("/api/v1/audit-events")
        assert resp.status_code == 401

    def test_system_reset_requires_auth(self, auth_client: TestClient) -> None:
        resp = auth_client.post(
            "/api/v1/system/reset",
            json={"confirm": "DELETE EVERYTHING"},
        )
        assert resp.status_code == 401


class TestWorkspaceIsolation:
    def test_user_cannot_access_other_users_patient(self, auth_client: TestClient) -> None:
        """User A creates a patient; User B must get 404 trying to access it."""
        # Register User A and create a patient
        reg_a = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "usera@example.com", "password": "UserAPass123"},
        )
        token_a = reg_a.json()["access_token"]
        patient_resp = auth_client.post(
            "/api/v1/patients",
            json={"display_name": "User A Patient"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert patient_resp.status_code == 201
        patient_id = patient_resp.json()["id"]

        # Register User B and try to access User A's patient
        reg_b = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "userb@example.com", "password": "UserBPass123"},
        )
        token_b = reg_b.json()["access_token"]
        resp = auth_client.get(
            f"/api/v1/patients/{patient_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        # Must return 404 to prevent patient ID enumeration (not 403)
        assert resp.status_code == 404

    def test_user_only_sees_own_patients_in_list(self, auth_client: TestClient) -> None:
        """User A's patient list must not include User B's patients."""
        # Register User A
        reg_a = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "lista@example.com", "password": "ListAPass123"},
        )
        token_a = reg_a.json()["access_token"]
        auth_client.post(
            "/api/v1/patients",
            json={"display_name": "User A Patient"},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        # Register User B
        reg_b = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "listb@example.com", "password": "ListBPass123"},
        )
        token_b = reg_b.json()["access_token"]
        auth_client.post(
            "/api/v1/patients",
            json={"display_name": "User B Patient"},
            headers={"Authorization": f"Bearer {token_b}"},
        )

        # User A's list must only show their own patient
        resp_a = auth_client.get(
            "/api/v1/patients",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp_a.json()["total"] == 1
        assert resp_a.json()["items"][0]["display_name"] == "User A Patient"

        # User B's list must only show their own patient
        resp_b = auth_client.get(
            "/api/v1/patients",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp_b.json()["total"] == 1
        assert resp_b.json()["items"][0]["display_name"] == "User B Patient"

    def test_get_me_returns_current_user(self, auth_client: TestClient) -> None:
        reg = auth_client.post(
            "/api/v1/auth/register",
            json={"email": "me@example.com", "password": "MePass1234", "full_name": "Me User"},
        )
        token = reg.json()["access_token"]
        resp = auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@example.com"
        assert resp.json()["full_name"] == "Me User"
