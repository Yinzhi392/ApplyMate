"use strict";

const { findMany, updateExactlyOne } = require("./cloudbase-document-store");

const TEN_MINUTES = 10 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

function createReliabilityCleanup({ database, now = () => new Date() }) {
  return async (event) => {
    if (!event || event.reliabilityProbeCleanup !== true || Object.keys(event).length !== 1) {
      return {
        ok: false,
        error: {
          code: "RESOURCE_PAUSED",
          message: "Only synthetic reliability-probe cleanup is enabled.",
          retryable: true,
        },
      };
    }
    const jobs = database.collection("ai_jobs");
    const usage = database.collection("daily_usage");
    const candidates = await findMany(jobs, {
      recordType: "ai_job",
      kind: "reliability_probe",
      syntheticTest: true,
    });
    const timestamp = now().toISOString();
    let recovered = 0;
    for (const job of candidates) {
      if (
        TERMINAL_STATUSES.has(job.status) ||
        typeof job.updatedAt !== "string" ||
        now().getTime() - new Date(job.updatedAt).getTime() <= TEN_MINUTES
      ) {
        continue;
      }
      const failed = await updateExactlyOne(
        jobs.where({
          recordType: "ai_job",
          jobId: job.jobId,
          kind: "reliability_probe",
          syntheticTest: true,
          status: job.status,
          updatedAt: job.updatedAt,
        }),
        {
          status: "failed",
          statusHistory: [
            ...(Array.isArray(job.statusHistory) ? job.statusHistory : []),
            { status: "failed", enteredAt: timestamp },
          ],
          error: { code: "TASK_TIMEOUT", message: "Synthetic reliability probe expired." },
          updatedAt: timestamp,
        },
      );
      if (!failed) continue;
      await updateExactlyOne(
        usage.where({
          recordType: "reliability_probe_usage",
          jobId: job.jobId,
          syntheticTest: true,
          reserved: 1,
        }),
        { reserved: 0, succeeded: 0, updatedAt: timestamp },
      );
      recovered += 1;
    }
    return { ok: true, data: { scanned: candidates.length, recovered } };
  };
}

module.exports = { createReliabilityCleanup };
