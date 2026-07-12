#!/usr/bin/env bash
# One-shot local launcher — sets up and starts EVERYTHING:
#   backend venv + dependencies, database schema (+ column migrations on boot),
#   demo data & users (first run), frontend dependencies, both servers.
#
#   bash app/startup.sh                 # SQLite (default, zero config)
#   ECOSPHERE_SEED=1 bash app/startup.sh   # force a (re)seed of demo data/users
#
# CockroachDB: put ECOSPHERE_DATABASE_URL in the gitignored app/backend/.env
# (or export it) — no credentials ever live in this script.
set -euo pipefail

cd "$(dirname "$0")"

# ---- free stale ports from previous runs ----
for port in 8000 5173; do
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "▶ freeing port $port (pid $pid)"
    kill "$pid" 2>/dev/null || true
  fi
done

# ---- backend ----
cd backend
if [ ! -x .venv/bin/uvicorn ]; then
  echo "▶ creating backend venv"
  python3 -m venv .venv
fi
echo "▶ syncing backend dependencies"
.venv/bin/pip install --quiet -r requirements.txt

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

# seed demo data + users once (SQLite first run), or when forced.
# For a fresh CockroachDB database run once with ECOSPHERE_SEED=1.
if { [ ! -f data/ecosphere.db ] && [ -z "${ECOSPHERE_DATABASE_URL:-}" ]; } || [ "${ECOSPHERE_SEED:-}" = "1" ]; then
  echo "▶ seeding demo data & users (password lands in data/DEMO_CREDENTIALS.txt)"
  .venv/bin/python -m ecosphere_api.seed
fi

echo "▶ starting backend on :8000 (runs schema migrations on boot)"
.venv/bin/uvicorn ecosphere_api.main:app --port 8000 &
BACKEND_PID=$!

# wait until the API answers before starting the frontend
for _ in $(seq 1 30); do
  if curl -s -o /dev/null http://127.0.0.1:8000/api/health; then break; fi
  sleep 0.5
done
curl -s -o /dev/null http://127.0.0.1:8000/api/health \
  && echo "▶ backend is healthy" \
  || { echo "✗ backend failed to start — see output above"; exit 1; }

# ---- frontend ----
cd ../frontend
if [ ! -d node_modules ]; then
  echo "▶ installing frontend deps"
  npm install --no-audit --no-fund
fi

cleanup() { kill "$BACKEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo ""
echo "✔ EcoSphere is up — open http://localhost:5173"
echo "  logins: fabien.pinckaers@odoo.com (super admin) · admin@acme.com (admin) · aditi@acme.com … (employees)"
echo "  password: backend/data/DEMO_CREDENTIALS.txt"
echo ""
npm run dev
