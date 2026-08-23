"use strict";

const { findMany, findOne } = require("./cloudbase-document-store");

const BUDGET_LIMIT_FEN = 10_000;
const BUDGET_WARNING_FEN = 8_000;
const BUDGET_STOP_FEN = 9_000;
const DAILY_SUCCESS_LIMIT = 20;
const CREATE_WINDOW_MILLISECONDS = 10 * 60 * 1000;
const CREATE_WINDOW_LIMIT = 3;
const EXPORT_VERSION = "applymate-user-export-v1";
const READ_ONLY_ACTIONS = new Set([
  "admin.stats",
  "agreement.accept",
  "analytics.track",
  "application.get",
  "application.list",
  "auth.status",
  "job.get",
  "resume.list",
  "user.delete",
  "user.export",
  "user.get",
]);
const RETIRED_ACTIONS = new Set(["auth.status", "user.delete"]);
const AI_ACTIONS = new Set(["generation.create", "resume.parse"]);
const PUBLIC_ACTIONS = new Set([
  ...READ_ONLY_ACTIONS,
  "application.delete",
  "application.update",
  "feedback.submit",
  "generation.create",
  "performance.recordPreview",
  "resume.confirm",
  "resume.delete",
  "resume.parse",
  "resume.setDefault",
  "user.updatePreferences",
]);
const EXPORT_COLLECTIONS = Object.freeze([
  "users",
  "resumes",
  "applications",
  "ai_jobs",
  "feedback",
]);
const PRIVATE_EXPORT_FIELDS = new Set([
  "customuserid", "email", "emailaddress", "identityhash", "openid", "ownerid", "uid", "userid",
  "deletionconfirmationhash", "deletionconfirmationexpiresat",
]);

function runtimeError(code, message, retryable = false) {
  const error = new Error(message);
  error.publicCode = code;
  error.retryable = retryable;
  return error;
}

function beijingDateKey(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function periodKey(now) {
  return beijingDateKey(now).slice(0, 7);
}

function validIso(value) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function addBeijingCalendarMonths(value, months) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  const totalMonths = Number(values.year) * 12 + Number(values.month) - 1 + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = totalMonths % 12;
  const targetMonth = targetMonthIndex + 1;
  const targetDay = Math.min(
    Number(values.day),
    new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate(),
  );
  const pad = (number, length = 2) => String(number).padStart(length, "0");
  return `${pad(targetYear, 4)}-${pad(targetMonth)}-${pad(targetDay)}T${values.hour}:${values.minute}:${values.second}.${pad(instant.getUTCMilliseconds(), 3)}+08:00`;
}

function budgetExposure(record) {
  return Number(record.fixedCostFen || 0) +
    Math.max(Number(record.conservativeSettledFen || 0), Number(record.officialBilledFen || 0)) +
    Number(record.reservedFen || 0);
}

function budgetView(record) {
  const exposureFen = budgetExposure(record);
  return {
    limitFen: BUDGET_LIMIT_FEN,
    warningFen: BUDGET_WARNING_FEN,
    stopFen: BUDGET_STOP_FEN,
    fixedCostFen: Number(record.fixedCostFen || 0),
    reservedFen: Number(record.reservedFen || 0),
    conservativeSettledFen: Number(record.conservativeSettledFen || 0),
    officialBilledFen: Number(record.officialBilledFen || 0),
    officialSnapshotAt: typeof record.officialSnapshotAt === "string" ? record.officialSnapshotAt : null,
    exposureFen,
    remainingBeforeStopFen: Math.max(0, BUDGET_STOP_FEN - exposureFen),
    state: exposureFen >= BUDGET_STOP_FEN
      ? "paused"
      : exposureFen >= BUDGET_WARNING_FEN
        ? "warning"
        : "normal",
  };
}

async function loadPublicWebRuntime(database, now, experienceEnabled) {
  let config = null;
  let budget = null;
  try {
    config = await findOne(database.collection("service_config"), { _id: "public" });
    budget = await findOne(database.collection("budget_periods"), {
      _id: `budget_${periodKey(now)}`,
      recordType: "budget_period",
    });
  } catch {
    // A not-yet-provisioned production environment must fail closed while
    // auth.status remains available to explain the paused state.
  }
  if (
    config === null ||
    !validIso(config.publicLaunchAt) ||
    !validIso(config.aiClosesAt) ||
    !validIso(config.dataAccessEndsAt) ||
    !Number.isSafeInteger(config.estimatedAiTaskCostFen) ||
    config.estimatedAiTaskCostFen < 0 ||
    Date.parse(config.aiClosesAt) !== Date.parse(addBeijingCalendarMonths(config.publicLaunchAt, 2) || "") ||
    Date.parse(config.dataAccessEndsAt) !== Date.parse(addBeijingCalendarMonths(config.publicLaunchAt, 6) || "")
  ) {
    const timestamp = now.toISOString();
    return {
      access: {
        phase: "read_only",
        aiAvailability: "resource_paused",
        aiClosesAt: timestamp,
        dataAccessEndsAt: timestamp,
      },
      budget: null,
      estimatedAiTaskCostFen: 0,
      configured: false,
    };
  }
  const nowMilliseconds = now.getTime();
  const phase = nowMilliseconds >= new Date(config.dataAccessEndsAt).getTime()
    ? "retired"
    : nowMilliseconds >= new Date(config.aiClosesAt).getTime()
      ? "read_only"
      : "active";
  const currentBudget = budget === null ? null : budgetView(budget);
  const aiAvailability = phase !== "active"
    ? "scheduled_closed"
    : config.resourcePaused === true || !experienceEnabled || currentBudget === null
      ? "resource_paused"
      : currentBudget.state === "paused"
        ? "budget_paused"
        : "available";
  return {
    access: {
      phase,
      aiAvailability,
      aiClosesAt: config.aiClosesAt,
      dataAccessEndsAt: config.dataAccessEndsAt,
    },
    budget: currentBudget,
    estimatedAiTaskCostFen: config.estimatedAiTaskCostFen,
    configured: true,
  };
}

function assertPublicAction(action, serviceAccess) {
  if (!PUBLIC_ACTIONS.has(action)) {
    throw runtimeError("RESOURCE_PAUSED", "This action is not part of the public Web product.");
  }
  if (serviceAccess.phase === "retired" && !RETIRED_ACTIONS.has(action)) {
    throw runtimeError("SERVICE_READ_ONLY", "The service data-access period has ended.");
  }
  if (serviceAccess.phase === "read_only" && !READ_ONLY_ACTIONS.has(action)) {
    throw runtimeError("SERVICE_READ_ONLY", "The service is in read-only mode.");
  }
  if (AI_ACTIONS.has(action) && serviceAccess.aiAvailability !== "available") {
    throw runtimeError(
      serviceAccess.aiAvailability === "budget_paused"
        ? "MONTHLY_BUDGET_EXHAUSTED"
        : serviceAccess.phase === "active"
          ? "RESOURCE_PAUSED"
          : "SERVICE_READ_ONLY",
      "AI generation is unavailable.",
      serviceAccess.phase === "active",
    );
  }
}

function stripPrivateExportFields(value) {
  if (Array.isArray(value)) return value.map(stripPrivateExportFields);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_EXPORT_FIELDS.has(key.toLocaleLowerCase("en-US")))
    .map(([key, child]) => [key, stripPrivateExportFields(child)]));
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (value === undefined || value === null || value === "") return { collectionIndex: 0, offset: 0 };
  if (typeof value !== "string" || value.length > 512) throw runtimeError("INVALID_REQUEST", "Invalid export cursor.");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !Number.isInteger(parsed.collectionIndex) || parsed.collectionIndex < 0 ||
      parsed.collectionIndex >= EXPORT_COLLECTIONS.length ||
      !Number.isInteger(parsed.offset) || parsed.offset < 0
    ) throw new Error("invalid");
    return parsed;
  } catch {
    throw runtimeError("INVALID_REQUEST", "Invalid export cursor.");
  }
}

async function exportUserPage(database, userId, payload, now) {
  const limit = payload?.limit === undefined ? 100 : Number(payload.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw runtimeError("INVALID_REQUEST", "Export limit must be between 1 and 200.");
  }
  let { collectionIndex, offset } = decodeCursor(payload?.cursor);
  const records = [];
  while (collectionIndex < EXPORT_COLLECTIONS.length && records.length < limit) {
    const collectionName = EXPORT_COLLECTIONS[collectionIndex];
    const rows = await findMany(database.collection(collectionName), { userId }, 1000);
    const ordered = rows.slice().sort((left, right) => String(left._id).localeCompare(String(right._id)));
    while (offset < ordered.length && records.length < limit) {
      const row = ordered[offset];
      records.push({
        collection: collectionName,
        recordId: String(row._id),
        data: stripPrivateExportFields(row),
      });
      offset += 1;
    }
    if (offset >= ordered.length) {
      collectionIndex += 1;
      offset = 0;
    }
  }
  return {
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    records,
    nextCursor: collectionIndex >= EXPORT_COLLECTIONS.length
      ? null
      : encodeCursor({ collectionIndex, offset }),
  };
}

function transactionData(result) {
  return result && typeof result === "object" ? result.data : null;
}

async function reserveGenerationTransaction({
  database,
  estimatedCostFen,
  jobDocument,
  now,
  userId,
}) {
  if (typeof database.runTransaction !== "function") {
    throw runtimeError("RESOURCE_PAUSED", "CloudBase transactions are unavailable.", true);
  }
  return database.runTransaction(async (transaction) => {
    const jobs = transaction.collection("ai_jobs");
    const existingJob = transactionData(await jobs.doc(jobDocument._id).get());
    if (existingJob !== null) return { created: false, admissionId: existingJob.admissionId };

    const userJobs = transactionData(await jobs.where({ recordType: "ai_job", userId }).limit(100).get()) || [];
    if (userJobs.some((job) => !["succeeded", "failed"].includes(job.status))) {
      throw runtimeError("ACTIVE_JOB_EXISTS", "Only one AI task can run at a time.");
    }

    const usage = transaction.collection("daily_usage");
    const dateKey = beijingDateKey(now);
    const successfulUsage = transactionData(await usage.where({
      recordType: "web_jd_quota_slot",
      userId,
      dateKey,
      status: "succeeded",
    }).limit(100).get()) || [];
    if (successfulUsage.length >= DAILY_SUCCESS_LIMIT) {
      throw runtimeError("LIMIT_EXCEEDED", "Daily AI quota is exhausted.");
    }

    const admissions = transaction.collection("ai_task_admissions");
    const recent = transactionData(await admissions.where({ userId }).limit(100).get()) || [];
    const windowStart = now.getTime() - CREATE_WINDOW_MILLISECONDS;
    if (recent.filter((record) => new Date(record.createdAt).getTime() >= windowStart).length >= CREATE_WINDOW_LIMIT) {
      throw runtimeError("RATE_LIMITED", "Too many AI tasks were created in the last ten minutes.", true);
    }

    const period = periodKey(now);
    const budgetReference = transaction.collection("budget_periods").doc(`budget_${period}`);
    const budget = transactionData(await budgetReference.get());
    if (budget === null) throw runtimeError("RESOURCE_PAUSED", "Monthly budget configuration is unavailable.");
    if (
      Number(budget.limitFen) !== BUDGET_LIMIT_FEN ||
      Number(budget.warningFen) !== BUDGET_WARNING_FEN ||
      Number(budget.stopFen) !== BUDGET_STOP_FEN
    ) throw runtimeError("RESOURCE_PAUSED", "Monthly budget limits do not match the immutable production policy.");
    if (budgetExposure(budget) + estimatedCostFen >= BUDGET_STOP_FEN) {
      throw runtimeError("MONTHLY_BUDGET_EXHAUSTED", "Monthly AI budget is paused.");
    }

    const timestamp = now.toISOString();
    const admissionId = `admission_${jobDocument.jobId}`;
    const quotaReservationId = `quota_${jobDocument.jobId}`;
    await budgetReference.update({
      reservedFen: Number(budget.reservedFen || 0) + estimatedCostFen,
      updatedAt: timestamp,
    });
    await admissions.doc(admissionId).create({
      _id: admissionId,
      recordType: "ai_task_admission",
      admissionId,
      jobId: jobDocument.jobId,
      userId,
      periodKey: period,
      dateKey,
      reservedCostFen: estimatedCostFen,
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await usage.doc(quotaReservationId).create({
      _id: quotaReservationId,
      recordType: "web_jd_quota_slot",
      reservationId: quotaReservationId,
      userId,
      dateKey,
      jobId: jobDocument.jobId,
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await jobs.doc(jobDocument._id).create({
      ...jobDocument,
      admissionId,
      quotaReservationId,
    });
    return { created: true, admissionId, quotaReservationId };
  });
}

async function releaseGenerationReservation(database, jobId, now, error) {
  if (typeof database.runTransaction !== "function") return;
  await database.runTransaction(async (transaction) => {
    const jobs = transaction.collection("ai_jobs");
    const jobReference = jobs.doc(jobId);
    const job = transactionData(await jobReference.get());
    if (job === null || typeof job.admissionId !== "string") return;
    const admissionReference = transaction.collection("ai_task_admissions").doc(job.admissionId);
    const admission = transactionData(await admissionReference.get());
    if (admission === null || admission.status !== "reserved") return;
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
    await jobReference.update({
      status: "failed",
      error,
      updatedAt: now.toISOString(),
    });
  });
}

module.exports = {
  BUDGET_LIMIT_FEN,
  BUDGET_STOP_FEN,
  BUDGET_WARNING_FEN,
  EXPORT_VERSION,
  assertPublicAction,
  budgetView,
  exportUserPage,
  loadPublicWebRuntime,
  releaseGenerationReservation,
  reserveGenerationTransaction,
  runtimeError,
};
