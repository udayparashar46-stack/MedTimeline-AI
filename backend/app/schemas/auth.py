"""Pydantic schemas for authentication and user management."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128, description="Password must be at least 8 characters.")
    full_name: Optional[str] = Field(None, max_length=200)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
