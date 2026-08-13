# API Cloud Function

This function will authenticate the trusted CloudBase identity, validate actions, create or query jobs, and handle lightweight persistence. It must not call OCR or TokenHub directly.

Phase 9 keeps ordered JD validation and asynchronous `generation.create`, but no longer exposes a JD confirmation action. Low-confidence fields are omitted, missing company/title values fall back to “贵司”/“该岗位”, and insufficient content fails without consuming quota. `src/identity-api.ts` composes generation and application actions with the existing identity, agreement, invitation, idempotency, resource, resume, and task gates. A confirmed resume is the only resume eligible to become generation evidence.

Phase 8 adds two-step `user.delete`, irreversible pending deletion, audited administrator invitation/user/quota actions, `admin.stats`, and metadata-only resource usage logs. Deletion confirmations and invitation codes are stored only as hashes. Resource logs require an internal user ID and reject unlisted fields so account cleanup can remove them without retaining prompts or user content.

Phase 10 adds `analytics.track` with an exact two-event allowlist (`app_opened` and owned `greeting_copied`), minimal participation timestamps on the user record, generation disclosure snapshots on applications, five deduplicated product metrics, and per-identity invitation failure locking. No analytics collection or third-party tracking SDK is introduced.

All `InMemory*Repository` implementations exist only for deterministic local tests. They prove the required atomic boundaries but are not production database or storage adapters. The deployment directory now contains a locally tested CloudBase document-store primitive and `ai_jobs` repository with deterministic insert, single-worker claim and optimistic status transitions. The local live handler can project an owned job through `job.get`, without exposing worker claim fields; the deployed cloud function has not been updated with this change. Job creation, asynchronous dispatch, resume persistence, quota transactions and worker execution remain paused until separately reviewed and authorized.
