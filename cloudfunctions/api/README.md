# API Cloud Function

This function will authenticate the trusted CloudBase identity, validate actions, create or query jobs, and handle lightweight persistence. It must not call OCR or TokenHub directly.

Phase 5 adds temporary resume-file ownership, file/text validation, asynchronous `resume.parse`, confirmation, listing, default selection, deletion, and the bridge used by a resume worker. `src/identity-api.ts` composes these actions with the existing identity, agreement, invitation, idempotency, and task gates. A confirmed resume is the only resume eligible to become generation evidence.

All `InMemory*Repository` implementations exist only for deterministic local tests. They prove the required atomic boundaries but are not production database or storage adapters. CloudBase transaction-backed repositories, an asynchronous dispatcher, and a deployed handler must not be added until the related cloud resources are separately authorized and the SDK passes the dependency audit.
