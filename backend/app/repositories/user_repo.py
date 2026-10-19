"""User repository — database queries for User model."""

from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.models.user import User
from app.core.security import get_password_hash


def get_user_by_email(db: Session, email: str) -> User | None:
    """Return user by lowercase email, or None."""
    return db.execute(
        select(User).where(User.email == email.lower().strip())
    ).scalar_one_or_none()


def get_user(db: Session, user_id: str) -> User | None:
    """Return user by ID, or None."""
    return db.execute(
        select(User).where(User.id == user_id)
    ).scalar_one_or_none()


def create_user(
    db: Session,
    email: str,
    password: str,
    full_name: str | None = None,
    is_superuser: bool = False,
) -> User:
    """Create a new user with bcrypt-hashed password."""
    user = User(
        email=email.lower().strip(),
        hashed_password=get_password_hash(password),
        full_name=full_name.strip() if full_name else None,
        is_superuser=is_superuser,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def count_users(db: Session) -> int:
    """Count total users in the database."""
    from sqlalchemy import func
    return db.execute(select(func.count(User.id))).scalar_one()
