"""Database session factory for MedTimeline AI.

Creates a SQLite database in the data/ folder (git-ignored) or connects
to a provided DATABASE_URL (e.g. PostgreSQL in production).
Uses SQLAlchemy 2.0 style with a sessionmaker for dependency injection.
"""

from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.core.config import settings

if settings.DATABASE_URL:
    db_url = settings.DATABASE_URL
    # Render/Heroku fix: replace postgres:// with postgresql:// for SQLAlchemy 2.0
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
else:
    # Ensure the data/ directory exists
    data_dir = Path(settings.DATABASE_DIR).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    db_url = f"sqlite:///{data_dir / settings.DATABASE_FILE}"

is_sqlite = db_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,  # Set True to log SQL queries for debugging
    pool_pre_ping=not is_sqlite,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a DB session per request and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
