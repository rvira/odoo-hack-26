# Owner: D (ARCHITECTURE.md §2) — Phase 4.
"""Badge, reward, challenge, challenge.participation, employee XP (§3.1/§3.2).

badge.unlock_rule is evaluated by a restricted AST-based arithmetic evaluator
(allow-listed names xp / challenges_completed only) — NEVER eval() (CWE-94,
§5 rule 3). Reward redemption uses SELECT ... FOR UPDATE + derived balance +
stock_non_negative CHECK so concurrent redeems cannot go negative (§5b).
"""
