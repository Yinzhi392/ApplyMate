"use strict";

const { createHash } = require("node:crypto");
const { addIfAbsent, findMany, findOne, updateDocument } = require("./cloudbase-document-store");

const ACTIONS = new Set([
  "analytics.track", "performance.recordPreview", "user.updatePreferences",
  "resume.parse", "resume.confirm", "resume.list", "resume.setDefault", "resume.delete",
  "generation.create", "generation.rewrite",
  "application.list", "application.get", "application.update", "application.delete",
  "feedback.submit",
]);

function hashId(domain, value) {
  return createHash("sha256").update(`${domain}\0${value}`, "utf8").digest("hex").slice(0, 24);
}

function beijingDateKey(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function reserveDailyGenerationSlot(collection, userId, jobId, now, maximum = 20) {
  const dateKey = beijingDateKey(now);
  for (let slot = 1; slot <= maximum; slot += 1) {
    const reservationId = `quota_${hashId("web-jd-quota-slot-v1", `${userId}:${dateKey}:${slot}`)}`;
    const created = await addIfAbsent(collection, {
      _id: reservationId,
      recordType: "web_jd_quota_slot",
      reservationId,
      userId,
      dateKey,
      slot,
      jobId,
      status: "reserved",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    if (created) return reservationId;
    const existing = await findOne(collection, { _id: reservationId });
    if (existing?.jobId === jobId) return reservationId;
  }
  return null;
}

async function reserveRewriteRateSlot(collection, userId, jobId, now) {
  const windowKey = String(Math.floor(now.getTime() / (10 * 60 * 1000)));
  for (let slot = 1; slot <= 5; slot += 1) {
    const reservationId = `rewrite_${hashId("web-rewrite-rate-v1", `${userId}:${windowKey}:${slot}`)}`;
    const created = await addIfAbsent(collection, {
      _id: reservationId,
      recordType: "web_rewrite_rate_slot",
      reservationId,
      userId,
      windowKey,
      slot,
      jobId,
      expiresAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
    });
    if (created) return reservationId;
    const existing = await findOne(collection, { _id: reservationId });
    if (existing?.jobId === jobId) return reservationId;
  }
  return null;
}

function failure(code, message, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}

function invalid() {
  return failure("INVALID_REQUEST", "Invalid request.");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function decodeStoredProfile(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clone(value);
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function copyText(body) {
  return `${body.trim()}\nAI生成内容，请核对真实性`;
}

function normalizePreferenceText(value) {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function countVisibleCharacters(value) {
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
  return Array.from(segmenter.segment(value.normalize("NFC")), ({ segment }) => segment)
    .filter((segment) => !/^\s+$/u.test(segment)).length;
}

function createPreferenceFacts(value) {
  const facts = new Set(
    value
      .split(/[\r\n]+|[。！？；;.!?]+/u)
      .map(normalizePreferenceText)
      .filter(Boolean),
  );
  return Array.from(facts, (text) => ({
    factId: `fact_${createHash("sha256").update(`applymate-fact-v1\0preference\0${text}`, "utf8").digest("hex").slice(0, 24)}`,
    sourceType: "preference",
    text,
    factHash: createHash("sha256").update(text, "utf8").digest("hex"),
  }));
}

function active(user, accessState) {
  return user.accountStatus === "enabled" && accessState(user) === "active";
}

function validFiles(fileIds, maximum, user) {
  const ownerPath = `/temporary/web/${user.userId}/`;
  const requiresWebOwnerPath = user.identityNamespace === "web-anonymous-uid-v1";
  return Array.isArray(fileIds) && fileIds.length > 0 && fileIds.length <= maximum &&
    fileIds.every((fileId) => typeof fileId === "string" && /^cloud:\/\//u.test(fileId) &&
      (requiresWebOwnerPath ? fileId.includes(ownerPath) : fileId.includes("/temporary/")));
}

function clientPipelineMetrics(payload) {
  if (
    !["jd-submit-v3", "jd-submit-v4", "jd-submit-v5-url-ocr", "jd-submit-v6-background-upload"].includes(payload.clientPipelineVersion) ||
    !Number.isInteger(payload.clientImagePreparationMs) ||
    payload.clientImagePreparationMs < 0 ||
    payload.clientImagePreparationMs > 120_000
  ) return {};
  const boundedMetric = (value, maximum = 120_000) =>
    Number.isInteger(value) && value >= 0 && value <= maximum ? value : undefined;
  return {
    clientImagePreparationMs: payload.clientImagePreparationMs,
    clientPipelineVersion: payload.clientPipelineVersion,
    ...(boundedMetric(payload.originalBytes, 50_000_000) === undefined
      ? {}
      : { originalBytes: payload.originalBytes }),
    ...(boundedMetric(payload.clientCompressedCount, 5) === undefined
      ? {}
      : { clientCompressedCount: payload.clientCompressedCount }),
    ...(boundedMetric(payload.clientCompressionMs) === undefined
      ? {}
      : { clientCompressionMs: payload.clientCompressionMs }),
    ...(boundedMetric(payload.clientUploadMs) === undefined
      ? {}
      : { clientUploadMs: payload.clientUploadMs }),
    ...(boundedMetric(payload.clientBackgroundUploadMs) === undefined
      ? {}
      : { clientBackgroundUploadMs: payload.clientBackgroundUploadMs }),
    ...(boundedMetric(payload.clientSelectionToCreateMs) === undefined
      ? {}
      : { clientSelectionToCreateMs: payload.clientSelectionToCreateMs }),
  };
}

function createExperienceApiHandler({
  database,
  dispatchExperienceJob,
  accessState,
  now = () => new Date(),
}) {
  return async ({ event, user }) => {
    if (!ACTIONS.has(event.action)) return null;
    if (!active(user, accessState)) return failure("FORBIDDEN", "Access denied.");
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload : {};
    const timestamp = now().toISOString();
    const resumes = database.collection("resumes");
    const applications = database.collection("applications");
    const jobs = database.collection("ai_jobs");
    const dailyUsage = database.collection("daily_usage");
    const users = database.collection("users");

    if (event.action === "user.updatePreferences") {
      if (typeof payload.preferenceText !== "string" || countVisibleCharacters(payload.preferenceText) > 500) return invalid();
      const normalizedPreferenceText = payload.preferenceText.normalize("NFC").trim();
      const preferenceFacts = createPreferenceFacts(normalizedPreferenceText);
      await updateDocument(database.collection("users").where({
        recordType: "user", userId: user.userId,
      }), {
        preferenceText: normalizedPreferenceText, preferenceFacts, updatedAt: timestamp,
      });
      return { ok: true, data: { preferenceText: normalizedPreferenceText, preferenceFacts } };
    }

    if (event.action === "resume.parse") {
      const isText = payload.inputType === "text" && typeof payload.text === "string" && payload.text.trim().length > 0;
      const isFiles = ["images", "pdf", "docx"].includes(payload.inputType) && validFiles(payload.fileIds, 6, user);
      if ((!isText && !isFiles) || typeof event.requestId !== "string") return invalid();
      const suffix = hashId("resume-parse-v1", `${user.userId}:${event.requestId}`);
      const resumeId = `resume_${suffix}`;
      const jobId = `job_resume_${suffix}`;
      const existing = await findOne(jobs, { recordType: "ai_job", jobId });
      if (existing === null) {
        await addIfAbsent(resumes, {
          _id: resumeId, recordType: "resume", resumeId, userId: user.userId,
          jobId, status: "awaiting_confirmation", isDefault: false, profile: null,
          createdAt: timestamp, updatedAt: timestamp,
        });
        await addIfAbsent(jobs, {
          _id: jobId, recordType: "ai_job", jobId, userId: user.userId,
          kind: "resume_parse", status: "queued", statusHistory: [{ status: "queued", enteredAt: timestamp }],
          input: clone(payload), resumeId, claimState: "available", createdAt: timestamp, updatedAt: timestamp,
        });
      }
      if (existing === null || (existing.status === "queued" && existing.claimState === "available")) {
        const result = await dispatchExperienceJob(jobId);
        if (!result || result.ok !== true) return result || failure("WORKER_FAILED", "Resume processing failed.", true);
      }
      return { ok: true, data: { jobId, resumeId } };
    }

    if (event.action === "resume.list") {
      const records = await findMany(resumes, { recordType: "resume", userId: user.userId });
      return { ok: true, data: { resumes: records.map(({ _id, recordType, userId, ...record }) => ({
        ...clone(record),
        profile: decodeStoredProfile(record.profile),
      })) } };
    }

    if (event.action === "resume.confirm") {
      if (typeof payload.resumeId !== "string" || !payload.profile || typeof payload.profile !== "object") return invalid();
      const record = await findOne(resumes, { recordType: "resume", userId: user.userId, resumeId: payload.resumeId });
      if (record === null) return failure("NOT_FOUND", "Resume was not found.");
      const confirmed = await findMany(resumes, { recordType: "resume", userId: user.userId, status: "confirmed" });
      const profile = { ...clone(payload.profile), resumeId: payload.resumeId, confirmed: true };
      await updateDocument(resumes.where({
        recordType: "resume", userId: user.userId, resumeId: payload.resumeId,
      }), {
        profile: JSON.stringify(profile), status: "confirmed", confirmedAt: timestamp,
        isDefault: record.isDefault || confirmed.length === 0, updatedAt: timestamp,
      });
      if (!user.firstResumeConfirmedAt) {
        await updateDocument(users.where({ recordType: "user", userId: user.userId }), {
          firstResumeConfirmedAt: timestamp,
          updatedAt: timestamp,
        });
      }
      return { ok: true, data: { resumeId: payload.resumeId, confirmed: true } };
    }

    if (event.action === "resume.setDefault") {
      if (typeof payload.resumeId !== "string") return invalid();
      const records = await findMany(resumes, { recordType: "resume", userId: user.userId });
      if (!records.some((record) => record.resumeId === payload.resumeId && record.status === "confirmed")) {
        return failure("NOT_FOUND", "Resume was not found.");
      }
      for (const record of records) {
        await updateDocument(resumes.where({
          recordType: "resume", userId: user.userId, resumeId: record.resumeId,
        }), { isDefault: record.resumeId === payload.resumeId, updatedAt: timestamp });
      }
      return { ok: true, data: { resumeId: payload.resumeId } };
    }

    if (event.action === "resume.delete") {
      if (typeof payload.resumeId !== "string") return invalid();
      const record = await findOne(resumes, { recordType: "resume", userId: user.userId, resumeId: payload.resumeId });
      if (record === null) return failure("NOT_FOUND", "Resume was not found.");
      await resumes.where({ recordType: "resume", userId: user.userId, resumeId: payload.resumeId }).remove();
      return { ok: true, data: { deleted: true } };
    }

    if (event.action === "generation.create") {
      const isText = payload.inputType === "text" && typeof payload.text === "string" && payload.text.trim().length > 0;
      const isFiles = payload.inputType === "images" && validFiles(payload.fileIds, 5, user);
      if ((!isText && !isFiles) || typeof payload.resumeId !== "string" || typeof event.requestId !== "string") return invalid();
      const resume = await findOne(resumes, { recordType: "resume", userId: user.userId, resumeId: payload.resumeId, status: "confirmed" });
      if (resume === null) return failure("NOT_FOUND", "Confirmed resume was not found.");
      const suffix = hashId("generation-v1", `${user.userId}:${event.requestId}`);
      const jobId = `job_generation_${suffix}`;
      const existing = await findOne(jobs, { recordType: "ai_job", jobId });
      if (existing === null) {
        const quotaReservationId = await reserveDailyGenerationSlot(
          dailyUsage,
          user.userId,
          jobId,
          now(),
          20 + Math.max(0, Number(user.dailyQuotaAdjustments?.[beijingDateKey(now())] || 0)),
        );
        if (quotaReservationId === null) {
          return failure("LIMIT_EXCEEDED", "Daily JD quota is exhausted.");
        }
        const created = await addIfAbsent(jobs, {
          _id: jobId, recordType: "ai_job", jobId, userId: user.userId,
          kind: "greeting_generate", status: "queued", statusHistory: [{ status: "queued", enteredAt: timestamp }],
          input: clone(payload), resumeId: payload.resumeId,
          quotaReservationId,
          processingMetrics: clientPipelineMetrics(payload),
          claimState: "available", createdAt: timestamp, updatedAt: timestamp,
        });
        if (!created) {
          await dailyUsage.where({ _id: quotaReservationId, status: "reserved" }).remove();
        }
      }
      if (existing === null || (existing.status === "queued" && existing.claimState === "available")) {
        const result = await dispatchExperienceJob(jobId);
        if (!result || result.ok !== true) return result || failure("WORKER_FAILED", "Generation failed.", true);
      }
      return { ok: true, data: { jobId } };
    }

    if (event.action === "generation.rewrite") {
      if (
        typeof payload.applicationId !== "string" ||
        !["rephrase", "shorten", "add_detail"].includes(payload.mode) ||
        typeof event.requestId !== "string"
      ) return invalid();
      const application = await findOne(applications, {
        recordType: "application", userId: user.userId, applicationId: payload.applicationId,
      });
      if (application === null) return failure("NOT_FOUND", "Application was not found.");
      const suffix = hashId("generation-rewrite-v1", `${user.userId}:${event.requestId}`);
      const jobId = `job_generation_${suffix}`;
      const existing = await findOne(jobs, { recordType: "ai_job", jobId });
      if (existing === null) {
        const rewriteReservationId = await reserveRewriteRateSlot(
          dailyUsage,
          user.userId,
          jobId,
          now(),
        );
        if (rewriteReservationId === null) {
          return failure("LIMIT_EXCEEDED", "Rewrite rate limit is exhausted. Please try again later.");
        }
        await addIfAbsent(jobs, {
          _id: jobId, recordType: "ai_job", jobId, userId: user.userId,
          kind: "greeting_rewrite", status: "queued", statusHistory: [{ status: "queued", enteredAt: timestamp }],
          input: { applicationId: payload.applicationId, mode: payload.mode },
          resumeId: application.resumeId, rewriteReservationId,
          claimState: "available", createdAt: timestamp, updatedAt: timestamp,
        });
      }
      if (existing === null || (existing.status === "queued" && existing.claimState === "available")) {
        const result = await dispatchExperienceJob(jobId);
        if (!result || result.ok !== true) return result || failure("WORKER_FAILED", "Rewrite failed.", true);
      }
      return { ok: true, data: { jobId } };
    }

    if (event.action === "application.list") {
      const query = { recordType: "application", userId: user.userId };
      if (payload.status === "applied" || payload.status === "not_applied") query.status = payload.status;
      const records = await findMany(applications, query);
      return { ok: true, data: { applications: records.map(({ _id, recordType, userId, ...record }) => clone(record)) } };
    }

    if (event.action === "application.get") {
      if (typeof payload.applicationId !== "string") return invalid();
      const record = await findOne(applications, { recordType: "application", userId: user.userId, applicationId: payload.applicationId });
      if (record === null) return failure("NOT_FOUND", "Application was not found.");
      const { _id, recordType, userId, generationDisclosure, feedback, ...application } = record;
      return {
        ok: true,
        data: {
          application: clone(application),
          copyText: copyText(record.greetingBody),
          generationDisclosure: generationDisclosure === undefined
            ? { availability: "unavailable", message: "生成信息不可用" }
            : {
                availability: "available",
                ...clone(generationDisclosure),
                message: "内容由已公示的 AI 服务生成",
              },
          feedback,
        },
      };
    }

    if (event.action === "application.update") {
      if (typeof payload.applicationId !== "string") return invalid();
      const record = await findOne(applications, { recordType: "application", userId: user.userId, applicationId: payload.applicationId });
      if (record === null) return failure("NOT_FOUND", "Application was not found.");
      const updates = { updatedAt: timestamp };
      if (typeof payload.greetingBody === "string") updates.greetingBody = payload.greetingBody.slice(0, 2000);
      if (typeof payload.memo === "string") updates.memo = payload.memo.slice(0, 500);
      if (payload.status === "applied" || payload.status === "not_applied") updates.status = payload.status;
      await updateDocument(applications.where({
        recordType: "application", userId: user.userId, applicationId: payload.applicationId,
      }), updates);
      return { ok: true, data: { manualEvaluation: { warnings: [] } } };
    }

    if (event.action === "application.delete") {
      if (typeof payload.applicationId !== "string") return invalid();
      const record = await findOne(applications, { recordType: "application", userId: user.userId, applicationId: payload.applicationId });
      if (record === null) return failure("NOT_FOUND", "Application was not found.");
      await applications.where({
        recordType: "application", userId: user.userId, applicationId: payload.applicationId,
      }).remove();
      return { ok: true, data: { deleted: true } };
    }

    if (event.action === "feedback.submit") {
      if (typeof payload.applicationId !== "string" || !["satisfied", "needs_improvement"].includes(payload.rating)) return invalid();
      const record = await findOne(applications, { recordType: "application", userId: user.userId, applicationId: payload.applicationId });
      if (record === null) return failure("NOT_FOUND", "Application was not found.");
      const feedback = { rating: payload.rating, note: typeof payload.note === "string" ? payload.note.slice(0, 500) : "", updatedAt: timestamp };
      await updateDocument(applications.where({
        recordType: "application", userId: user.userId, applicationId: payload.applicationId,
      }), { feedback, updatedAt: timestamp });
      return { ok: true, data: { feedback } };
    }

    if (event.action === "performance.recordPreview") {
      const keys = Object.keys(payload).sort().join(",");
      if (
        keys !== "applicationId,clientApiCreateMs,clientJobToPreviewMs,clientResultFetchMs,clientSelectionToPreviewMs,jobId" ||
        typeof payload.applicationId !== "string" ||
        typeof payload.jobId !== "string" ||
        !/^application_[a-f0-9]{24}$/u.test(payload.applicationId) ||
        !/^job_generation_[a-f0-9]{24}$/u.test(payload.jobId)
      ) return invalid();
      const metricNames = [
        "clientApiCreateMs",
        "clientJobToPreviewMs",
        "clientResultFetchMs",
        "clientSelectionToPreviewMs",
      ];
      if (metricNames.some((name) =>
        !Number.isInteger(payload[name]) || payload[name] < 0 || payload[name] > 120_000
      )) return invalid();
      const [job, application] = await Promise.all([
        findOne(jobs, {
          recordType: "ai_job",
          jobId: payload.jobId,
          userId: user.userId,
        }),
        findOne(applications, {
          recordType: "application",
          applicationId: payload.applicationId,
          userId: user.userId,
        }),
      ]);
      if (
        job === null ||
        application === null ||
        application.jobId !== job.jobId ||
        job.status !== "succeeded"
      ) return failure("NOT_FOUND", "Result was not found.");
      const previewMetrics = Object.fromEntries(
        metricNames.map((name) => [name, payload[name]]),
      );
      await Promise.all([
        updateDocument(jobs.where({
          recordType: "ai_job", jobId: job.jobId, userId: user.userId,
        }), { processingMetrics: { ...(job.processingMetrics || {}), ...previewMetrics } }),
        updateDocument(applications.where({
          recordType: "application", applicationId: application.applicationId, userId: user.userId,
        }), { processingMetrics: { ...(application.processingMetrics || {}), ...previewMetrics } }),
      ]);
      return { ok: true, data: { recorded: true } };
    }

    if (event.action === "analytics.track") {
      if (payload.event === "app_opened" && Object.keys(payload).length === 1) {
        const analytics = { ...(user.analytics || {}) };
        analytics.firstOpenedAt ||= timestamp;
        analytics.lastOpenedAt = timestamp;
        if (analytics.firstGenerationSucceededAt) {
          const elapsed = now().getTime() - new Date(analytics.firstGenerationSucceededAt).getTime();
          if (elapsed >= 24 * 60 * 60 * 1000 && elapsed <= 7 * 24 * 60 * 60 * 1000) {
            analytics.returnedDay2To7At ||= timestamp;
          }
        }
        await updateDocument(users.where({ recordType: "user", userId: user.userId }), {
          analytics,
          updatedAt: timestamp,
        });
        return { ok: true, data: { tracked: true } };
      }
      if (
        payload.event === "greeting_copied" &&
        typeof payload.applicationId === "string" &&
        Object.keys(payload).length === 2
      ) {
        const application = await findOne(applications, {
          recordType: "application", userId: user.userId, applicationId: payload.applicationId,
        });
        if (application === null) return failure("NOT_FOUND", "Application was not found.");
        const analytics = { ...(user.analytics || {}), firstGreetingCopiedAt: user.analytics?.firstGreetingCopiedAt || timestamp };
        await updateDocument(users.where({ recordType: "user", userId: user.userId }), {
          analytics,
          updatedAt: timestamp,
        });
        return { ok: true, data: { tracked: true } };
      }
      return invalid();
    }
    return invalid();
  };
}

module.exports = { createExperienceApiHandler };
