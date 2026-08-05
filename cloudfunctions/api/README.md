# API Cloud Function

This function will authenticate the trusted CloudBase identity, validate actions, create or query jobs, and handle lightweight persistence. It must not call OCR or TokenHub directly.

Phase 3 provides the local identity and access domain: explicit action routing, trusted-context identity hashing, agreement acceptance, single-use invitations, preferences, administrator status changes, and audit records. `src/identity-api.ts` composes these actions through injected context and repository ports.

`InMemoryIdentityRepository` exists only for deterministic local tests. It proves the required atomic boundaries but is not a production database adapter. A CloudBase transaction-backed repository and deployed handler must not be added until the related cloud resource is separately authorized and its SDK passes the dependency audit.
