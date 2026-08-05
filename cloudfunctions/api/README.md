# API Cloud Function

This function will authenticate the trusted CloudBase identity, validate actions, create or query jobs, and handle lightweight persistence. It must not call OCR or TokenHub directly.

Phase 4 adds local task, idempotency, quota, dispatch, deadline, stale-job recovery, and free-resource gate domains. `src/identity-api.ts` exposes safe task lookup and administrator quota adjustment; `src/api-entry.ts` composes trusted identity, idempotent write replay, and first-execution resource checks.

All `InMemory*Repository` implementations exist only for deterministic local tests. They prove the required atomic boundaries but are not production database adapters. CloudBase transaction-backed repositories, an asynchronous dispatcher, and a deployed handler must not be added until the related cloud resources are separately authorized and the SDK passes the dependency audit.
