import { describe, expect, it } from "vitest";

import {
  InMemoryJobRepository,
  JobDispatchService,
  JobService,
  JobWorkerCoordinator,
  type JobDispatchPort,
} from "../../cloudfunctions/api/src/index.js";

const now = new Date("2026-08-05T12:00:00.000Z");

class DeferredDispatcher implements JobDispatchPort {
  readonly pendingJobIds: string[] = [];

  dispatch(jobId: string): void {
    this.pendingJobIds.push(jobId);
  }
}

describe("API to worker dispatch boundary", () => {
  it("returns a queued job before deferred processing runs", async () => {
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_synthetic_dispatch",
    );
    const dispatcher = new DeferredDispatcher();
    const service = new JobDispatchService(jobs, dispatcher);
    let externalCalls = 0;

    const job = await service.createAndDispatch(
      "user_synthetic_a",
      "resume_parse",
      now,
    );

    expect(job).toMatchObject({
      jobId: "job_synthetic_dispatch",
      status: "queued",
    });
    expect(dispatcher.pendingJobIds).toEqual([job.jobId]);
    expect(externalCalls).toBe(0);
  });

  it("runs external processing once under duplicate dispatch", async () => {
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_synthetic_duplicate",
    );
    const dispatcher = new DeferredDispatcher();
    const dispatch = new JobDispatchService(jobs, dispatcher);
    const worker = new JobWorkerCoordinator(jobs);
    const job = await dispatch.createAndDispatch(
      "user_synthetic_a",
      "greeting_generate",
      now,
    );
    let externalCalls = 0;
    const process = async () => {
      externalCalls += 1;
    };

    const results = await Promise.all([
      worker.runClaimed(job.jobId, "worker_a", now, process),
      worker.runClaimed(job.jobId, "worker_b", now, process),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(externalCalls).toBe(1);
  });
});
