# EcoSphere App — Python backend + React frontend

Standalone build of the EcoSphere spec ([PLAN.md](../PLAN.md), [ARCHITECTURE.md](../ARCHITECTURE.md),
[DESIGN_FRAMEWORK.md](../DESIGN_FRAMEWORK.md), [wireframe/index.html](../wireframe/index.html)).
Backend: **FastAPI + SQLAlchemy + SQLite** (local-first, offline). Frontend: **React + Vite**,
hand-rolled SVG charts, design tokens ported from the approved wireframe.

The API surface both halves build against is [API_CONTRACT.md](API_CONTRACT.md).

## Run it

### 1. Backend (port 8000)

```bash
cd app/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# one-time: load the historic dataset into SQLite (the server itself never
# fabricates data — it only reads/writes the DB)
.venv/bin/python -m ecosphere_api.seed

.venv/bin/uvicorn ecosphere_api.main:app --port 8000
```

The seed loads **4 organizations** with 12 months of operational history — after that,
every number is a live SQL aggregate and all new inputs come from real user actions
(bookings, proof uploads, approvals, redemptions).

**Demo logins** — password is *generated* by the seed and written to
`app/backend/data/DEMO_CREDENTIALS.txt` (gitignored, 0600). To pick your own instead:
`ECOSPHERE_DEMO_PASSWORD=<yours> .venv/bin/python -m ecosphere_api.seed`.

| Account | Role |
|---|---|
| `fabien.pinckaers@odoo.com` | **Super Admin** — Odoo platform tier, sees all organizations (cross-org roll-up, alerts & interventions, suggestion inbox) |
| `admin@acme.com` | ESG Admin of Acme Corp (OU-1001, full org navigation) |
| `aditi@acme.com`, `karan@acme.com`, `priya@acme.com`, `rohit@acme.com`, `sana@acme.com` | Acme employees |

Helix Pharma (OU-1002), Zenith Textiles (OU-1003) and Nova Foods (OU-1004) are sibling
orgs visible only to the Super Admin; org users are pinned to their own org by
query-level record rules.

Reset the demo: stop the server, delete `data/ecosphere.db`, re-run the seed, start again.

### 2. Frontend (port 5173)

```bash
cd app/frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to the backend.

## What's enforced server-side (§8 business rules)

- **Auto emission math** — transaction CO₂e = quantity × emission factor; unit must match the factor's unit, dates can't be in the future, quantities must be positive.
- **Evidence Requirement** — approving a CSR/challenge participation without an attached proof file is rejected (409) while the toggle is ON.
- **Badge Auto-Award** — structured unlock rules (XP / challenges completed / CSR joined; no eval) run the moment XP changes.
- **Compliance ownership** — issues require owner + due date; open issues past due are auto-flagged Overdue and notify the owner.
- **Atomic reward redemption** — guarded stock decrement + derived balance check in one transaction; `CHECK (stock >= 0)` backstops it.
- **Challenge lifecycle** — Draft → Active → Under Review → Completed (Archive from anywhere); illegal transitions get 409.
- **ESG configuration** — score weights must sum to exactly 100.

Security posture: bcrypt passwords, hashed bearer session tokens (constant-time compare),
role + ownership + **organization** checks on every route (the Super Admin is read-scoped
to the platform dashboard — org record surfaces return 403), Pydantic schemas with
unknown-field rejection, magic-byte-validated size-capped uploads stored outside any web
root and streamed back only to the owner or a same-org admin, per-IP rate limits,
security headers, generic client errors.
