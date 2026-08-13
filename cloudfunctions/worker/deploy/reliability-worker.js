"use strict";

const { CloudBaseJobRepository } = require("./cloudbase-job-repository");
const { updateExactlyOne } = require("./cloudbase-document-store");

const PROBE_JOB_ID_PATTERN = /^job_probe_[a-f0-9]{24}$/u;

function failure(code, message, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}

function createReliabilityWorker({ database, now = () => new Date() }) {
  return async (event) => {
    if (!event || typeof event.jobId !== "string" || !PROBE_JOB_ID_PATTERN.test(event.jobId)) {
      return failure("RESOURCE_PAUSED", "Only synthetic reliability probes are enabled.", true);
    }
    const jobs = new CloudBaseJobRepository(database.collection("ai_jobs"));
    const existing = await jobs.getJobById(event.jobId);
    if (existing === null || existing.syntheticTest !== true || existing.kind !== "reliability_probe") {
      return failure("NOT_FOUND", "Reliability probe was not found.");
    }
    if (existing.status === "succeeded" || existing.status === "failed") {
      return { ok: true, data: { jobId: existing.jobId, status: existing.status, replayed: true } };
    }
    const workerId = `worker_probe_${event.jobId.slice(-12)}`;
    const claimed = await jobs.claimJob(event.jobId, workerId, now());
    if (claimed === null) {
      return failure("CONFLICT", "Reliability probe is already being processed.", true);
    }
    const generating = await jobs.transitionJob(event.jobId, "queued", "generating", now());
    if (generating === null) {
      return failure("CONFLICT", "Reliability probe could not enter generation.", true);
    }
    const validating = await jobs.transitionJob(event.jobId, "generating", "validating", now());
    if (validating === null) {
      return failure("CONFLICT", "Reliability probe could not enter validation.", true);
    }
    const completedAt = now().toISOString();
    const succeeded = await jobs.transitionJob(event.jobId, "validating", "succeeded", now(), {
      result: { probe: "cloudbase_reliability", completedAt },
    });
    if (succeeded === null) {
      return failure("CONFLICT", "Reliability probe could not complete.", true);
    }
    const usageSettled = await updateExactlyOne(
      database.collection("daily_usage").where({
        recordType: "reliability_probe_usage",
        jobId: event.jobId,
        syntheticTest: true,
        reserved: 1,
      }),
      { reserved: 0, succeeded: 1, updatedAt: completedAt },
    );
    if (!usageSettled) {
      return failure("CONFLICT", "Reliability probe usage could not be settled.", true);
    }
    return { ok: true, data: { jobId: event.jobId, status: "succeeded", replayed: false } };
  };
}

module.exports = { createReliabilityWorker };
