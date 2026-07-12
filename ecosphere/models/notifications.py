# Owner: G (ARCHITECTURE.md §2) — Phase 5.
"""Mail notification helper mixin used by governance/social/gamification.

Wraps mail.activity / mail.message / mail.template; every event is gated on its
esg_notify_* company toggle (ARCHITECTURE.md §5 rule 6).
"""
