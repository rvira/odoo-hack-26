#!/usr/bin/env bash
# One-shot local launcher: sets up the backend venv + deps, seeds the demo data
# (first run only), installs frontend deps and starts both servers.
#
#   ./app/startup.sh              # SQLite (default, zero config)
#   ECOSPHERE_DATABASE_URL=...    # or put it in app/backend/.env — CockroachDB
#
# The database URL is never stored in this script — it comes from the
# environment or the gitignored app/backend/.env.
set -euo pipefail

cd "$(dirname "$0")"

# ---- backend ----
cd backend
if [ ! -x .venv/bin/uvicorn ]; then
  echo "▶ creating backend venv"
  python3 -m venv .venv
  .venv/bin/pip install --quiet -r requirements.txt
fi

# load the gitignored env file if present (CockroachDB URL, demo password, …)
if [ -f .env ]; then
  set -a; . ./.env; set +a
  echo "▶ loaded backend/.env"
fi

if [ -n "${ECOSPHERE_DATABASE_URL:-}" ]; then
  echo "▶ database: CockroachDB (from ECOSPHERE_DATABASE_URL)"
else
  echo "▶ database: SQLite (data/ecosphere.db)"
fi

# seed once — the server never fabricates data, it only reads/writes the DB
if [ ! -f data/ecosphere.db ] && [ -z "${ECOSPHERE_DATABASE_URL:-}" ] || [ "${ECOSPHERE_SEED:-}" = "1" ]; then
  echo "▶ seeding demo data (credentials land in data/DEMO_CREDENTIALS.txt)"
  .venv/bin/python -m ecosphere_api.seed
fi

echo "▶ starting backend on :8000"
.venv/bin/uvicorn ecosphere_api.main:app --port 8000 &
BACKEND_PID=$!

# ---- frontend ----
cd ../frontend
if [ ! -d node_modules ]; then
  echo "▶ installing frontend deps"
  npm install --no-audit --no-fund
fi

cleanup() { kill "$BACKEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "▶ starting frontend on :5173 — open http://localhost:5173"
echo "  demo logins: app/README.md · password: backend/data/DEMO_CREDENTIALS.txt"
npm run dev
