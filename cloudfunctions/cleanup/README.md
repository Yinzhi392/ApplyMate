# Cleanup Cloud Function

This scheduled function will recover stale jobs, release quota reservations, remove temporary files and expired records, and complete account deletion. Phase 6 adds idempotent retries for JD image references that remain after OCR because storage deletion temporarily failed.

The current implementation is exercised only with in-memory repositories. It does not include a scheduler, CloudBase database/storage adapter, deployed handler, or real deletion request.
