"use strict";

const { addDocument, findMany, removeDocuments } = require("./cloudbase-document-store");

const PROBE_ID_PATTERN = /^delete_probe_[a-f0-9]{24}$/u;
const COLLECTIONS = Object.freeze([
  "users", "invites", "resumes", "applications", "ai_jobs", "daily_usage", "feedback", "audit_logs",
]);

function createSyntheticAccountDeletion({ database, now = () => new Date() }) {
  return async (event) => {
    const probeId = event?.probeId;
    if (
      !event || event.syntheticAccountDeletionCleanup !== true ||
      Object.keys(event).length !== 2 || typeof probeId !== "string" || !PROBE_ID_PATTERN.test(probeId)
    ) {
      return {
        ok: false,
        error: { code: "RESOURCE_PAUSED", message: "Only synthetic account deletion is enabled.", retryable: true },
      };
    }
    const deleted = {};
    const remaining = {};
    for (const collectionName of COLLECTIONS) {
      const collection = database.collection(collectionName);
      const query = {
        recordType: "synthetic_deletion_probe",
        deletionProbeId: probeId,
        syntheticTest: true,
      };
      const result = await removeDocuments(collection.where(query));
      deleted[collectionName] = typeof result.deleted === "number" ? result.deleted : 0;
      remaining[collectionName] = (await findMany(collection, query, 10)).length;
    }
    const aggregateId = `anonymous_deletion_${probeId.slice(-24)}`;
    const aggregateQuery = {
      _id: aggregateId,
      recordType: "anonymous_account_deletion_metric",
      syntheticTest: true,
    };
    const aggregateCollection = database.collection("daily_usage");
    let existingAggregates = await findMany(aggregateCollection, aggregateQuery, 10);
    let aggregateCreated = existingAggregates.length === 0;
    const aggregateReconciled = existingAggregates.length > 1;
    if (aggregateReconciled) {
      await removeDocuments(aggregateCollection.where(aggregateQuery));
      existingAggregates = [];
    }
    if (existingAggregates.length === 0) {
      await addDocument(database.collection("daily_usage"), {
        ...aggregateQuery,
        date: now().toISOString().slice(0, 10),
        count: 1,
        createdAt: now().toISOString(),
      });
    }
    const aggregateCount = (await findMany(aggregateCollection, aggregateQuery, 10)).length;
    return {
      ok: true,
      data: {
        probeId,
        deleted,
        remaining,
        aggregateCreated,
        aggregateReconciled,
        aggregateCount,
        aggregateContainsUserId: false,
      },
    };
  };
}

module.exports = { COLLECTIONS, createSyntheticAccountDeletion };
