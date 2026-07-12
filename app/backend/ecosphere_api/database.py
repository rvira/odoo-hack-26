"""Engine + session factory, selected by environment.

ECOSPHERE_DATABASE_URL unset  -> local SQLite (default; zero-dependency dev)
ECOSPHERE_DATABASE_URL set    -> CockroachDB / Postgres-wire URL, e.g.
    cockroachdb://user:pass@host:26257/ecosphere?sslmode=verify-full

The URL always comes from the environment — never from source control.
`postgresql://` URLs (as copied from the CockroachDB Cloud console) are
accepted and upgraded to the cockroachdb dialect automatically. TLS is
mandatory for remote URLs: if sslmode is missing it defaults to verify-full.
"""
import os
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "ecosphere.db"


def _remote_url(raw: str) -> str:
    """Normalize a CockroachDB Cloud URL: force the cockroachdb dialect and
    fail closed on TLS (verify-full unless the URL says otherwise)."""
    parts = urlparse(raw)
    scheme = parts.scheme
    if scheme in ("postgresql", "postgres"):
        scheme = "cockroachdb"
    if scheme != "cockroachdb":
        raise ValueError(
            "ECOSPHERE_DATABASE_URL must be a cockroachdb:// or postgresql:// URL"
        )
    query = parse_qs(parts.query)
    query.setdefault("sslmode", ["verify-full"])
    return urlunparse(parts._replace(scheme=scheme, query=urlencode(query, doseq=True)))


_DATABASE_URL = os.environ.get("ECOSPHERE_DATABASE_URL", "").strip()

if _DATABASE_URL:
    IS_SQLITE = False
    engine = create_engine(
        _remote_url(_DATABASE_URL),
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
    )
else:
    IS_SQLITE = True
    engine = create_engine(
        f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
