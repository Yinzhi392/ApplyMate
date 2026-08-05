import { describe, expect, it } from "vitest";

import {
  InMemoryJobRepository,
  InMemoryQuotaRepository,
  JobService,
  QuotaService,
  StaleJobCleanupService,
} from "../../cloudfunctions/api/src/index.js";

const cleanupAt = new Date("2026-08-05T12:10:00.000Z");

describe("ten-minute stale job cleanup", () => {
  it("fails only jobs at least ten minutes old and releases once", async () => {
    let index = 0;
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => `job_synthetic_${++index}`,
    );
    const quotas = new QuotaService(new InMemoryQuotaRepository());
    const staleCreatedAt = new Date("2026-08-05T12:00:00.000Z");
    const freshCreatedAt = new Date("2026-08-05T12:00:01.000Z");
    await quotas.reserve(
      "user_synthetic_a",
      "reservation_synthetic_stale",
      staleCreatedAt,
    );
    await quotas.reserve(
      "user_synthetic_a",
      "reservation_synthetic_fresh",
      freshCreatedAt,
    );
    const stale = await jobs.createJob(
      "user_synthetic_a",
      "greeting_generate",
      staleCreatedAt,
      "reservation_synthetic_stale",
    );
    const fresh = await jobs.createJob(
      "user_synthetic_a",
      "greeting_generate",
      freshCreatedAt,
      "reservation_synthetic_fresh",
    );
    await jobs.claimJob(stale.jobId, "worker_terminated", staleCreatedAt);
    const cleanup = new StaleJobCleanupService(jobs, quotas);

    await expect(cleanup.run(cleanupAt)).resolves.toEqual({
      candidates: 1,
      failed: 1,
    });
    await expect(
      jobs.getJobForUser("user_synthetic_a", stale.jobId),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "JOB_STALE_TIMEOUT", retryable: true },
    });
    await expect(
      jobs.getJobForUser("user_synthetic_a", fresh.jobId),
    ).resolves.toMatchObject({ status: "queued" });
    await expect(
      quotas.getUsage("user_synthetic_a", cleanupAt),
    ).resolves.toMatchObject({ reserved: 1, succeeded: 0 });

    await expect(cleanup.run(cleanupAt)).resolves.toEqual({
      candidates: 0,
      failed: 0,
    });
    await expect(
      quotas.getUsage("user_synthetic_a", cleanupAt),
    ).resolves.toMatchObject({ reserved: 1, succeeded: 0 });
  });

  it("does not reclaim a job waiting for user confirmation", async () => {
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_synthetic_waiting",
    );
    const createdAt = new Date("2026-08-05T10:00:00.000Z");
    const job = await jobs.createJob(
      "user_synthetic_a",
      "resume_parse",
      createdAt,
    );
    await jobs.transitionJob(job.jobId, "parsing", createdAt);
    await jobs.transitionJob(
      job.jobId,
      "awaiting_user_confirmation",
      createdAt,
    );
    const cleanup = new StaleJobCleanupService(
      jobs,
      new QuotaService(new InMemoryQuotaRepository()),
    );

    await expect(cleanup.run(cleanupAt)).resolves.toEqual({
      candidates: 0,
      failed: 0,
    });
    await expect(
      jobs.getJobForUser("user_synthetic_a", job.jobId),
    ).resolves.toMatchObject({ status: "awaiting_user_confirmation" });
  });
});
