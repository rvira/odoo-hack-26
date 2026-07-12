"""EcoSphere API — FastAPI app assembly: security headers, locked-down CORS,
generic error responses, and startup create-tables + seed."""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import models  # noqa: F401 — register tables
from .database import Base, SessionLocal, engine
from .routers import (
    auth, dashboard, environmental, gamification, governance,
    notifications, platform, reports, settings_routes, social,
)

logger = logging.getLogger("ecosphere")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="EcoSphere API", docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    # generic client error; details stay server-side
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for router in (auth.router, dashboard.router, environmental.router, social.router,
               governance.router, gamification.router, reports.router,
               settings_routes.router, notifications.router, platform.router):
    app.include_router(router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _add_missing_columns():
    """create_all never ALTERs existing tables — add columns introduced after
    a database was first created. Works on SQLite and CockroachDB alike."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    wanted = {
        "participations": ("proof_method", "VARCHAR(10)"),
        "challenge_participations": ("proof_method", "VARCHAR(10)"),
    }
    with engine.begin() as conn:
        for table, (column, ddl_type) in wanted.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
                logger.info("migrated: %s.%s added", table, column)


@app.on_event("startup")
def startup():
    """The server never fabricates data — it only reads/writes the database.
    Historic demo data is loaded once, explicitly, via:
        python -m ecosphere_api.seed
    """
    Base.metadata.create_all(engine)
    _add_missing_columns()
    db = SessionLocal()
    try:
        if db.query(models.User).first() is None:
            logger.warning(
                "Database is empty — load the demo dataset once with: "
                "`python -m ecosphere_api.seed` (from app/backend, inside the venv)"
            )
    finally:
        db.close()
