# Owner: A (ARCHITECTURE.md §2) — Phase 2.
"""POST /ecosphere/ingest/<adapter> — auth='user', payload size-capped,
per-user + per-endpoint rate-limited, fail closed. Rows go through the same
validate_against_contract -> resolve_factor -> compute path as CSV/manual.
"""
