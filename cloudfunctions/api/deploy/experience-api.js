"use strict";

const { createHash } = require("node:crypto");
const { addIfAbsent, findMany, findOne, updateDocument } = require("./cloudbase-document-store");

const ACTIONS = new Set([
  "analytics.track", "user.updatePreferences",
  "resume.parse", "resume.confirm", "resume.list", "resume.setDefault", "resume.delete",
  "generation.create", "generation.rewrite",
  "application.list", "application.get", "application.update", "application.delete",
  "feedback.submit",
]);

function hashId(domain, value) {
  return createHash("sha256").update(`${domain}\0${value}`, "utf8").digest("hex").slice(0, 24);
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

function active(user, accessState) {
  return user.accountStatus === "enabled" && accessState(user) === "active";
}

function validFiles(fileIds, maximum) {
  return Array.isArray(fileIds) && fileIds.length > 0 && fileIds.length <= maximum &&
    fileIds.every((fileId) => typeof fileId === "string" && /^cloud:\/\//u.test(fileId) && fileId.includes("/temporary/"));
}

function createExperienceApiHandler({ database, dispatchExperienceJob, accessState, now = () => new Date() }) {
  return async ({ event, user }) => {
    if (!ACTIONS.has(event.action)) return null;
    if (!active(user, accessState)) return failure("FORBIDDEN", "Access denied.");
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload : {};
    const timestamp = now().toISOString();
    const resumes = database.collection("resumes");
    const applications = database.collection("applications");
    const jobs = database.collection("ai_jobs");

    if (event.action === "user.updatePreferences") {
      if (typeof payload.text !== "string" || payload.text.length > 500) return invalid();
      await updateDocument(database.collection("users").where({
        recordType: "user", userId: user.userId,
      }), {
        preferenceText: payload.text.trim(), updatedAt: timestamp,
      });
      return { ok: true, data: { preferenceText: payload.text.trim() } };
    }

    if (event.action === "resume.parse") {
      const isText = payload.inputType === "text" && typeof payload.text === "string" && payload.text.trim().length > 0;
      const isFiles = ["images", "pdf", "docx"].includes(payload.inputType) && validFiles(payload.fileIds, 6);
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
      const isFiles = payload.inputType === "images" && validFiles(payload.fileIds, 5);
      if ((!isText && !isFiles) || typeof payload.resumeId !== "string" || typeof event.requestId !== "string") return invalid();
      const resume = await findOne(resumes, { recordType: "resume", userId: user.userId, resumeId: payload.resumeId, status: "confirmed" });
      if (resume === null) return failure("NOT_FOUND", "Confirmed resume was not found.");
      const suffix = hashId("generation-v1", `${user.userId}:${event.requestId}`);
      const jobId = `job_generation_${suffix}`;
      const existing = await findOne(jobs, { recordType: "ai_job", jobId });
      if (existing === null) {
        await addIfAbsent(jobs, {
          _id: jobId, recordType: "ai_job", jobId, userId: user.userId,
          kind: "greeting_generate", status: "queued", statusHistory: [{ status: "queued", enteredAt: timestamp }],
          input: clone(payload), resumeId: payload.resumeId, claimState: "available", createdAt: timestamp, updatedAt: timestamp,
        });
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
        await addIfAbsent(jobs, {
          _id: jobId, recordType: "ai_job", jobId, userId: user.userId,
          kind: "greeting_rewrite", status: "queued", statusHistory: [{ status: "queued", enteredAt: timestamp }],
          input: { applicationId: payload.applicationId, mode: payload.mode },
          resumeId: application.resumeId, claimState: "available", createdAt: timestamp, updatedAt: timestamp,
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
      return { ok: true, data: { application: clone(application), copyText: copyText(record.greetingBody), generationDisclosure, feedback } };
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

    if (event.action === "analytics.track") return { ok: true, data: { tracked: true } };
    return invalid();
  };
}

module.exports = { createExperienceApiHandler };
