import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WORKER_DEADLINE_MS,
  InMemoryJobRepository,
  InMemoryQuotaRepository,
  JobService,
  QuotaService,
  WorkerExecutionService,
} from "../../cloudfunctions/api/src/index.js";

const startedAt = new Date("2026-08-05T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("worker internal deadline", () => {
  it("fails before 45 seconds, releases quota, and ignores a late result", async () => {
    vi.useFakeTimers();
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_synthetic_timeout",
    );
    const quotas = new QuotaService(new InMemoryQuotaRepository());
    await quotas.reserve(
      "user_synthetic_a",
      "reservation_synthetic_timeout",
      startedAt,
    );
    const job = await jobs.createJob(
      "user_synthetic_a",
      "greeting_generate",
      startedAt,
      "reservation_synthetic_timeout",
    );
    let finishWork:
      | ((value: { result: { greeting: string } }) => void)
      | undefined;
    let workerSignal: AbortSignal | undefined;
    const worker = new WorkerExecutionService(
      jobs,
      quotas,
      () => new Date("2026-08-05T12:00:05.000Z"),
      5_000,
    );

    const execution = worker.run(
      job.jobId,
      "worker_synthetic_a",
      startedAt,
      (_claimed, signal) => {
        workerSignal = signal;
        return new Promise((resolve) => {
          finishWork = resolve;
        });
      },
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await execution;

    await expect(
      jobs.getJobForUser("user_synthetic_a", job.jobId),
    ).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "WORKER_DEADLINE",
        message: "Task processing timed out.",
        retryable: true,
      },
    });
    await expect(quotas.getUsage("user_synthetic_a", startedAt)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 0,
    });
    expect(workerSignal?.aborted).toBe(true);

    finishWork?.({ result: { greeting: "late synthetic result" } });
    await Promise.resolve();
    await expect(
      jobs.getJobForUser("user_synthetic_a", job.jobId),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("marks successful work once and converts its reservation", async () => {
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_synthetic_success",
    );
    const quotas = new QuotaService(new InMemoryQuotaRepository());
    await quotas.reserve(
      "user_synthetic_a",
      "reservation_synthetic_success",
      startedAt,
    );
    const job = await jobs.createJob(
      "user_synthetic_a",
      "resume_parse",
      startedAt,
      "reservation_synthetic_success",
    );
    await jobs.transitionJob(job.jobId, "parsing", startedAt);
    const worker = new WorkerExecutionService(
      jobs,
      quotas,
      () => new Date("2026-08-05T12:00:01.000Z"),
    );

    await worker.run(job.jobId, "worker_synthetic_a", startedAt, async () => ({
      result: { profileReady: true },
    }));

    await expect(
      jobs.getJobForUser("user_synthetic_a", job.jobId),
    ).resolves.toMatchObject({
      status: "succeeded",
      result: { profileReady: true },
    });
    await expect(quotas.getUsage("user_synthetic_a", startedAt)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 1,
    });
  });

  it("keeps the default deadline strictly below the platform limit", () => {
    expect(DEFAULT_WORKER_DEADLINE_MS).toBeLessThan(45_000);
    expect(
      () =>
        new WorkerExecutionService(
          new JobService(new InMemoryJobRepository()),
          new QuotaService(new InMemoryQuotaRepository()),
          () => startedAt,
          45_000,
        ),
    ).toThrowError("Worker deadline must be below 45 seconds.");
  });
});
