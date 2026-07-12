# Owner: A (ARCHITECTURE.md §2) — Phase 2.
"""Carbon engine (§3.2/§3.3): ecosphere.usecase, emission.source,
field.contract, ingestion.adapter, ingestion.batch/row, carbon.transaction.

carbon.transaction auto-calc is idempotent on (source_model, source_res_id);
unit must equal the factor unit (double-guarded, §6). Ingested rows — manual,
CSV, API and AI-proposed alike — all pass the same server-side
validate_against_contract -> resolve_factor -> compute path (§9).
"""
