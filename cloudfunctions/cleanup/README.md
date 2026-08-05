# Cleanup Cloud Function

This scheduled function will recover stale jobs, release quota reservations, remove temporary files and expired records, and complete account deletion. Phase 5 adds a provider-independent service that expires unconfirmed resume drafts after 24 hours and removes unreferenced resume files after one hour.

The current implementation is exercised only with in-memory repositories. It does not include a scheduler, CloudBase database/storage adapter, deployed handler, or real deletion request.
