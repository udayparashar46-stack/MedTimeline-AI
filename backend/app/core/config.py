"""Application configuration settings for MedTimeline AI."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "MedTimeline AI"
    API_V1_STR: str = "/api/v1"

    # Bind strictly to localhost (127.0.0.1) as mandated by plan Section 10.1
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Strict CORS allow-list: no wildcard origins allowed
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # SQLite database lives in the data/ folder which is git-ignored
    DATABASE_DIR: str = "../data"
    DATABASE_FILE: str = "medtimeline.db"

    # Local uploads storage directory (git-ignored)
    UPLOAD_DIR: str = "../data/uploads"
    MAX_FILE_SIZE_BYTES: int = 20 * 1024 * 1024  # 20 MB limit
    MAX_FILES_PER_BATCH: int = 25

    model_config = SettingsConfigDict(case_sensitive=True)


settings = Settings()
