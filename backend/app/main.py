"""Main application entry point for MedTimeline AI backend."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1 import health, patients, reports, results, tests, mapping, timeline, audit, system
from app.api.v1 import auth as auth_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine, SessionLocal, is_sqlite
from app.services.normalization.seeder import seed_canonical_tests

# Import all models so SQLAlchemy can discover them for create_all
import app.db.models  # noqa: F401

from sqlalchemy import text

# Resolve path to the built React SPA (built into frontend/dist at repo root)
_HERE = Path(__file__).resolve()  # .../backend/app/main.py
_REPO_ROOT = _HERE.parent.parent.parent  # three levels up → repo root
FRONTEND_DIST = _REPO_ROOT / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context: initialize database tables on startup, apply safe schema upgrades."""
    Base.metadata.create_all(bind=engine)

    # SQLite-only safe schema upgrades for existing databases
    if is_sqlite:
        with engine.connect() as conn:
            try:
                res = conn.execute(text("PRAGMA table_info(reports)"))
                cols = {row[1] for row in res.fetchall()}
                if cols:
                    if "is_date_ambiguous" not in cols:
                        conn.execute(text("ALTER TABLE reports ADD COLUMN is_date_ambiguous BOOLEAN DEFAULT 0 NOT NULL"))
                    if "date_alternatives" not in cols:
                        conn.execute(text("ALTER TABLE reports ADD COLUMN date_alternatives TEXT"))
                    if "extracted_text" not in cols:
                        conn.execute(text("ALTER TABLE reports ADD COLUMN extracted_text TEXT"))
                    conn.commit()

                res_r = conn.execute(text("PRAGMA table_info(extracted_results)"))
                cols_r = {row[1] for row in res_r.fetchall()}
                if cols_r and "test_id" not in cols_r:
                    conn.execute(text("ALTER TABLE extracted_results ADD COLUMN test_id VARCHAR(36)"))
                    conn.commit()
            except Exception:
                pass

    # Populate canonical test catalog from seed definitions
    try:
        with SessionLocal() as db_session:
            seed_canonical_tests(db_session)
    except Exception:
        pass

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS: use configured origins (strict list — no wildcards with credentials)
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include API Routers
app.include_router(health.router, prefix=settings.API_V1_STR)
app.include_router(auth_router.router, prefix=settings.API_V1_STR)
app.include_router(patients.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(results.router, prefix=settings.API_V1_STR)
app.include_router(tests.router, prefix=settings.API_V1_STR)
app.include_router(mapping.router, prefix=settings.API_V1_STR)
app.include_router(timeline.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(system.router, prefix=settings.API_V1_STR)


# ---------------------------------------------------------------------------
# /api/health shortcut (Render health-check convenience alias)
# ---------------------------------------------------------------------------

@app.get("/api/health", tags=["health"], include_in_schema=False)
async def api_health_shortcut() -> dict:
    """Top-level health alias for load-balancers that probe /api/health."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve React SPA for non-API routes (MUST be registered last)
# ---------------------------------------------------------------------------

if FRONTEND_DIST.exists():
    # Mount the hashed assets folder so they get cache-friendly Content-Type headers
    _assets_dir = FRONTEND_DIST / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        """Catch-all: serve index.html so client-side routing works."""
        return FileResponse(str(FRONTEND_DIST / "index.html"))
