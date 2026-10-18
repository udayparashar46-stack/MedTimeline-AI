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

    model_config = SettingsConfigDict(case_sensitive=True)


settings = Settings()
