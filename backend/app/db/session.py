"""Database session factory for MedTimeline AI.

Creates a SQLite database in the data/ folder (git-ignored).
Uses SQLAlchemy 2.0 style with a sessionmaker for dependency injection.
"""

from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.core.config import settings

# Ensure the data/ directory exists
data_dir = Path(settings.DATABASE_DIR)
data_dir.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{data_dir / settings.DATABASE_FILE}"

# check_same_thread=False is required for SQLite with FastAPI (multiple threads)
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,  # Set True to log SQL queries for debugging
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a DB session per request and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
