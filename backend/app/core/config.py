"""Application configuration settings for MedTimeline AI."""

from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "MedTimeline AI"
    API_V1_STR: str = "/api/v1"

    # Environment
    ENVIRONMENT: str = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Authentication & Security
    SECRET_KEY: str = "medtimeline-insecure-dev-secret-change-in-production-use-strong-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    AUTH_REQUIRED: bool = True

    # Strict CORS allow-list: accepts list or comma-separated string
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            if v.startswith("["):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Database configuration: support SQLite file or PostgreSQL connection URL
    DATABASE_URL: str | None = None
    DATABASE_DIR: str = "../data"
    DATABASE_FILE: str = "medtimeline.db"

    # Local uploads storage directory (git-ignored)
    UPLOAD_DIR: str = "../data/uploads"
    MAX_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB safe default limit
    MAX_FILES_PER_BATCH: int = 25

    # Storage Backend: "local" (default) or "s3" (AWS S3, Cloudflare R2, MinIO)
    STORAGE_BACKEND: str = "local"
    S3_BUCKET_NAME: str | None = None
    S3_REGION_NAME: str | None = None
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None

    # OCR feature configuration
    OCR_ENABLED: bool = True

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")


settings = Settings()
