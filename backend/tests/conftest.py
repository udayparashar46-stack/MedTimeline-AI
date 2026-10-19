"""Shared test fixtures for MedTimeline AI backend tests.

Provides:
- client: TestClient wired to in-memory SQLite + auth bypass via dependency override.
  The auth override returns a plain User instance (not attached to any session) with
  all attributes pre-populated, avoiding DetachedInstanceError on attribute access.
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.db.models.user import User
from app.api.deps import get_current_user

TEST_USER_ID = "test-user-uuid-fixture"
TEST_USER_EMAIL = "testuser@example.com"


def make_test_user() -> User:
    """Create a transient User with all attributes pre-loaded to avoid DetachedInstanceError."""
    u = User.__new__(User)
    # Bypass ORM init — set attrs directly on the Python object
    u.__dict__.update({
        "id": TEST_USER_ID,
        "email": TEST_USER_EMAIL,
        "hashed_password": "$2b$12$placeholder",
        "full_name": "Test User",
        "is_active": True,
        "is_superuser": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return u


@pytest.fixture()
def client():
    """Return a TestClient wired to a fresh in-memory SQLite database with auth bypassed."""
    engine_mem = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine_mem)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_mem)

    # Persist a real User row so patient.owner_id FK and lookups work
    db_setup = TestingSession()
    from app.core.security import get_password_hash
    db_user = User(
        id=TEST_USER_ID,
        email=TEST_USER_EMAIL,
        hashed_password=get_password_hash("TestPassword123"),
        full_name="Test User",
        is_active=True,
        is_superuser=False,
    )
    db_setup.add(db_user)
    db_setup.commit()
    db_setup.close()

    test_user = make_test_user()

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine_mem)
