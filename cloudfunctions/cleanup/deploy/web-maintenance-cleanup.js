"use strict";

const { findMany, removeDocuments, updateExactlyOne } = require("./cloudbase-document-store");

const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);
const USER_SCOPED_COLLECTIONS = [
  "resumes", "applications", "ai_jobs", "daily_usage", "ai_task_admissions", "feedback", "audit_logs",
];
const RETIREMENT_COLLECTIONS = [
  "users", "resumes", "applications", "ai_jobs", "daily_usage", "ai_task_admissions",
  "feedback", "audit_logs", "service_config", "budget_periods",
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
    if (!failed) continue;
    const releasedAdmission = await releaseBudgetAdmission(database, job, now).catch(() => false);
    if (releasedAdmission || typeof job.quotaReservationId !== "string") {
      released += releasedAdmission ? 1 : 0;
      continue;
    }
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

function transactionData(result) {
  return result && typeof result === "object" ? result.data : null;
}

async function releaseBudgetAdmission(database, job, now) {
  if (typeof job.admissionId !== "string" || typeof database.runTransaction !== "function") return false;
  return database.runTransaction(async (transaction) => {
    const admissionReference = transaction.collection("ai_task_admissions").doc(job.admissionId);
    const admission = transactionData(await admissionReference.get());
    if (admission === null || admission.status !== "reserved") return false;
    const budgetReference = transaction.collection("budget_periods").doc(`budget_${admission.periodKey}`);
    const budget = transactionData(await budgetReference.get());
    if (budget !== null) {
      await budgetReference.update({
        reservedFen: Math.max(0, Number(budget.reservedFen || 0) - Number(admission.reservedCostFen || 0)),
        updatedAt: now.toISOString(),
      });
    }
    await admissionReference.update({ status: "released", settledCostFen: 0, updatedAt: now.toISOString() });
    if (typeof job.quotaReservationId === "string") {
      await transaction.collection("daily_usage").doc(job.quotaReservationId).delete();
    }
    return true;
  });
}

async function deletePendingAccounts(database, now) {
  const users = await findMany(database.collection("users"), {
    recordType: "user",
    accountStatus: "disabled",
    deletionStatus: "pending",
  }, 100);
  let deleted = 0;
  for (const user of users) {
    const admissions = await findMany(database.collection("ai_task_admissions"), {
      recordType: "ai_task_admission",
      userId: user.userId,
      status: "reserved",
    }, 100);
    for (const admission of admissions) {
      const job = await findMany(database.collection("ai_jobs"), {
        recordType: "ai_job",
        userId: user.userId,
        admissionId: admission.admissionId,
      }, 1);
      await releaseBudgetAdmission(database, {
        admissionId: admission.admissionId,
        quotaReservationId: job[0]?.quotaReservationId,
      }, now).catch(() => false);
    }
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

async function deleteExpiredDrafts(database, now) {
  const resumes = await findMany(database.collection("resumes"), {
    recordType: "resume",
    status: "awaiting_confirmation",
  }, 1000);
  const boundary = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let deleted = 0;
  for (const resume of resumes) {
    if (!olderThan(resume.createdAt, boundary)) continue;
    await removeDocuments(database.collection("resumes").where({ _id: resume._id, status: "awaiting_confirmation" }));
    deleted += 1;
  }
  return deleted;
}

async function deleteExpiredLogs(database, now) {
  const logs = await findMany(database.collection("audit_logs"), {}, 1000);
  const boundary = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  let deleted = 0;
  for (const log of logs) {
    if (!olderThan(log.createdAt, boundary)) continue;
    await removeDocuments(database.collection("audit_logs").where({ _id: log._id }));
    deleted += 1;
  }
  return deleted;
}

async function retirementInventory(database, now) {
  const config = (await findMany(database.collection("service_config"), { _id: "public" }, 1))[0] || null;
  const retired = typeof config?.dataAccessEndsAt === "string" &&
    new Date(config.dataAccessEndsAt).getTime() <= now.getTime();
  const collections = {};
  for (const collectionName of RETIREMENT_COLLECTIONS) {
    collections[collectionName] = (await findMany(database.collection(collectionName), {}, 1000)).length;
  }
  return {
    generatedAt: now.toISOString(),
    retired,
    collections,
    storageObjects: "REQUIRES_SEPARATE_STORAGE_INVENTORY",
    deletionAuthorized: false,
  };
}

function createWebMaintenanceCleanup({ database, now = () => new Date() }) {
  return async (event) => {
    if (!event || event.webMaintenanceCleanup !== true || Object.keys(event).length !== 1) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request.", retryable: false } };
    }
    const current = now();
    const [releasedQuotaReservations, deletedAccounts, deletedRewriteSlots, deletedDrafts, deletedLogs] = await Promise.all([
      releaseStaleJobs(database, current),
      deletePendingAccounts(database, current),
      deleteExpiredRewriteSlots(database, current),
      deleteExpiredDrafts(database, current),
      deleteExpiredLogs(database, current),
    ]);
    return {
      ok: true,
      data: { releasedQuotaReservations, deletedAccounts, deletedRewriteSlots, deletedDrafts, deletedLogs },
    };
  };
}

function createRetirementInventory({ database, now = () => new Date() }) {
  return async (event) => {
    if (!event || event.retirementInventory !== true || Object.keys(event).length !== 1) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid request.", retryable: false } };
    }
    return { ok: true, data: await retirementInventory(database, now()) };
  };
}

module.exports = { createRetirementInventory, createWebMaintenanceCleanup };
