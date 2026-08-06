# API Cloud Function

This function will authenticate the trusted CloudBase identity, validate actions, create or query jobs, and handle lightweight persistence. It must not call OCR or TokenHub directly.

Phase 6 adds ordered JD validation, asynchronous `generation.create`, low-confidence `generation.confirmJd`, generation/application records, one total worker deadline, quality-gated persistence, quota settlement, and dispatch compensation. `src/identity-api.ts` composes these actions with the existing identity, agreement, invitation, idempotency, resource, resume, and task gates. A confirmed resume is the only resume eligible to become generation evidence.

Phase 8 adds two-step `user.delete`, irreversible pending deletion, audited administrator invitation/user/quota actions, `admin.stats`, and metadata-only resource usage logs. Deletion confirmations and invitation codes are stored only as hashes. Resource logs require an internal user ID and reject unlisted fields so account cleanup can remove them without retaining prompts or user content.

All `InMemory*Repository` implementations exist only for deterministic local tests. They prove the required atomic boundaries but are not production database or storage adapters. CloudBase transaction-backed repositories, an asynchronous dispatcher, and a deployed handler must not be added until the related cloud resources are separately authorized and the SDK passes the dependency audit.
