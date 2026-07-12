# Owner: P0 (ARCHITECTURE.md §2) — shared spine, Phase 1.
"""ESG configuration on res.company / res.config.settings + the score mixin.

Holds the E/S/G weights (each 0-100, sum == 100 enforced server-side) and every
esg_* enforcement toggle (auto emission, evidence, badge auto-award, notify_*,
alerting master switch). Toggles are read at enforcement time, never cached
(ARCHITECTURE.md §5 rule 7).
"""
