# Owner: F (ARCHITECTURE.md §2) — Phase 6, isolated (§9).
"""POST /ecosphere/copilot/{extract,ask,narrative} — auth='user', 10 MB cap,
rate-limited, CR/LF rejected in echoed values. Uploads are magic-byte checked,
size-capped, stored as ir.attachment with server-generated filenames. On any
network/API error return a clean "Copilot unavailable" message — no exception
may propagate into scoring or booking (graceful degradation).
"""
