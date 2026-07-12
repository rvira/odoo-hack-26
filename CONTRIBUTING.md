# Contributing to EcoSphere

Thanks for helping build EcoSphere! This guide keeps the repo clean, the history meaningful, and `main` demoable at all times.

## Workflow

1. **`main` is always demoable.** Never commit directly to it.
2. Create a feature branch: `feat/<phase>-<topic>` (e.g. `feat/env-carbon-engine`), or `fix/<topic>` for bug fixes.
3. Open a Pull Request — every PR needs **at least one reviewer** before merge.
4. Keep commits small and frequent with meaningful messages:

   ```
   feat(env): auto carbon txn from fleet fuel log
   fix(gamification): block reward redeem when stock is zero
   docs: add validation matrix to plan
   ```

   Format: `type(scope): summary` — types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

5. **Everyone commits their own work from their own account.** No proxy pushes — contributor history matters.

## Code ownership

Work is split by vertical slice — each owner is responsible for their slice's **models, views, and validations** end to end. Cross-slice changes need the slice owner as reviewer.

## Review checklist

Before requesting review, confirm:

- [ ] Server-side validation in place (required fields, cross-field checks, database constraints) — the server rejects bad input, the UI only explains it
- [ ] No hardcoded secrets, API keys or connection strings (use environment variables / secure config)
- [ ] All record access respects roles and access rules; any privilege escalation needs a comment justifying it
- [ ] User input is never concatenated into queries — parameterized bindings only
- [ ] UI follows the shared design tokens (no inline per-view colors) and the project's menu conventions
- [ ] Dashboards/KPIs bind to live data queries — no static JSON or hardcoded numbers
- [ ] Project sets up cleanly from scratch on a fresh database

## Reporting bugs

Open a GitHub issue with: what you did, what you expected, what happened, and steps to reproduce. For security vulnerabilities, **do not open a public issue** — see [SECURITY.md](SECURITY.md).

## Code of Conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
