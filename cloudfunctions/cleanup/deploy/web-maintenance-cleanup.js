"use strict";

const { findMany, removeDocuments, updateExactlyOne } = require("./cloudbase-document-store");

const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);
const USER_SCOPED_COLLECTIONS = [
  "resumes", "applications", "ai_jobs", "daily_usage", "feedback", "audit_logs",
];

function olderThan(value, boundary) {
  return typeof value === "string" && new Date(value).getTime() <= boundary.getTime();
}

async function releaseStaleJobs(database, now) {
  const jobs = await findMany(database.collection("ai_jobs"), { recordType: "ai_job" }, 1000);
  const boundary = new Date(now.getTime() - 10 * 60 * 1000);
  let released = 0;
  for (const job of jobs) {
    if (TERMINAL_STATUSES.has(job.status) || !olderThan(job.createdAt, boundary)) continue;
    const failed = await updateExactlyOne(database.collection("ai_jobs").where({
      _id: job._id,
      userId: job.userId,
      status: job.status,
    }), {
      status: "failed",
      error: { code: "TASK_TIMEOUT", message: "Task timed out.", retryable: true },
      updatedAt: now.toISOString(),
    });
    if (!failed || typeof job.quotaReservationId !== "string") continue;
    await removeDocuments(database.collection("daily_usage").where({
      _id: job.quotaReservationId,
      userId: job.userId,
      jobId: job.jobId,
      status: "reserved",
    }));
    released += 1;
  }
  return released;
}

async function deletePendingAccounts(database) {
  const users = await findMany(database.collection("users"), {
    recordType: "user",
    accountStatus: "disabled",
    deletionStatus: "pending",
  }, 100);
  let deleted = 0;
  for (const user of users) {
    for (const collectionName of USER_SCOPED_COLLECTIONS) {
      await removeDocuments(database.collection(collectionName).where({ userId: user.userId }));
    }
    await removeDocuments(database.collection("invites").where({ claimedByUserId: user.userId }));
    await removeDocuments(database.collection("invites").where({ consumedByUserId: user.userId }));
    await removeDocuments(database.collection("users").where({ _id: user._id, userId: user.userId }));
    deleted += 1;
  }
  return deleted;
}

async function deleteExpiredRewriteSlots(database, now) {
  const slots = await findMany(database.collection("daily_usage"), {
    recordType: "web_rewrite_rate_slot",
  }, 1000);
  let deleted = 0;
  for (const slot of slots) {
    if (!olderThan(slot.expiresAt, now)) continue;
    await removeDocuments(database.collection("daily_usage").where({ _id: slot._id }));
    deleted += 1;
  }
  return deleted;
}

function createWebMaintenanceCleanup({ database, now = () => new Date() }) {
  return async (event) => {
    if (!event || event.webMaintenanceCleanup !== true || Object.keys(event).length !== 1) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request.", retryable: false } };
    }
    const current = now();
    const [releasedQuotaReservations, deletedAccounts, deletedRewriteSlots] = await Promise.all([
      releaseStaleJobs(database, current),
      deletePendingAccounts(database),
      deleteExpiredRewriteSlots(database, current),
    ]);
    return {
      ok: true,
      data: { releasedQuotaReservations, deletedAccounts, deletedRewriteSlots },
    };
  };
}

module.exports = { createWebMaintenanceCleanup };
