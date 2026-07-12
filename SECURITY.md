# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in EcoSphere, **please do not open a public GitHub issue.**

Instead, report it privately to the maintainers (via GitHub's private vulnerability reporting, or by contacting a maintainer directly). Include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Any suggested fix, if you have one

We will acknowledge your report within a reasonable time frame and keep you informed as we work on a fix.

## Security practices in this project

- **No secrets in the repository** — API keys and credentials are loaded from environment variables or secure configuration storage, never committed. See `.env.example`.
- **Server-side enforcement** — all validation, access control, and business rules are enforced on the server; client-side checks are UX only.
- **Parameterized data access** — user input is never concatenated into queries.
- **File uploads** (participation proofs, invoices) are size-limited and stored outside any executable/web-served path.
