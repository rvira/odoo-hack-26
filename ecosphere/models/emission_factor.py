# Owner: P0 (ARCHITECTURE.md §2) — Phase 1.
"""ecosphere.emission.factor — validity-windowed master data (§3.1).

Never mutated in place; historical scores must stay reproducible. Resolution
is exact unit+scope inside the validity window and fails loud (§6): no factor
or an ambiguous set raises, never silently books zero.
"""
