# Cleanup Cloud Function

This scheduled function will recover stale jobs, release quota reservations, remove temporary files and expired records, and complete account deletion. Phase 6 adds idempotent retries for JD image references that remain after OCR because storage deletion temporarily failed.

Phase 8 adds immediate processing of confirmed account deletions, full user-linked data removal, anonymous daily deletion totals, and strict 180-day operational log retention. Identity is deleted last so a partial failure remains retryable; anonymous totals are incremented only after identity removal succeeds.

The current implementation is exercised only with in-memory repositories. It does not include a scheduler, CloudBase database/storage adapter, deployed handler, or verified production deletion SLA.
