# Owner: F (ARCHITECTURE.md §2) — Phase 6, isolated (§9).
"""Copilot adapter + Q&A/narrative service.

LLM key comes from ir.config_parameter (ecosphere.llm_api_key) or env
ECOSPHERE_LLM_API_KEY — never hardcoded, never sent to the client (CWE-798).
LLM output is untrusted data: it may only PROPOSE ingestion rows that re-enter
the standard validation path, and a human must explicitly Post them. Core
module must upgrade and run with this file absent.
"""
