# Owner: E (ARCHITECTURE.md §2) — Phase 3.
"""ecosphere.department.score + Overall ESG on res.company (§4).

Pillars are store=True with method-triggered recompute (read_group across a
period bucket); total is @api.depends on pillars + company weights; overall
ESG is compute-on-read. Nightly cron reconciles missed triggers.
"""
