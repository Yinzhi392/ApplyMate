# Shared

Shared runtime schemas, request/response types, error codes, state-machine rules, limits, and deterministic pure functions belong here. Provider SDKs, database access, and UI code must not enter this module.

Current modules cover Unicode-aware text rules, input limits, local PII masking, stable facts and preferences, resume/JD/evidence schemas, job transitions, API envelopes, AI/manual greeting checks, model self-reference and job/company requirements, and copied-text labeling. Import public contracts through `src/index.ts`.

Cross-function primitives such as the fixed UTC+8 Beijing date key also live here so `api` and `cleanup` do not import one another.
