import type { JobRecord } from "./job-domain.js";
import type { JobService } from "./job-service.js";
import type { QuotaService } from "./quota-service.js";

export const DEFAULT_WORKER_DEADLINE_MS = 44_000;
const PLATFORM_WORKER_LIMIT_MS = 45_000;

export interface WorkerCompletion {
  result: Record<string, unknown>;
}

class WorkerDeadlineError extends Error {
  constructor() {
    super("Worker deadline reached.");
    this.name = "WorkerDeadlineError";
  }
}

export class WorkerExecutionService {
  constructor(
    private readonly jobs: JobService,
    private readonly quotas: QuotaService,
    private readonly now: () => Date = () => new Date(),
    private readonly deadlineMs = DEFAULT_WORKER_DEADLINE_MS,
  ) {
    if (
      !Number.isSafeInteger(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs >= PLATFORM_WORKER_LIMIT_MS
    ) {
      throw new RangeError("Worker deadline must be below 45 seconds.");
    }
  }

  async run(
    jobId: string,
    workerId: string,
    startedAt: Date,
    work: (
      claimedJob: JobRecord,
      signal: AbortSignal,
    ) => Promise<WorkerCompletion>,
  ): Promise<boolean> {
    const claimed = await this.jobs.claimJob(jobId, workerId, startedAt);
    if (claimed === null) {
      return false;
    }

    const controller = new AbortController();
    let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineHandle = setTimeout(() => {
        reject(new WorkerDeadlineError());
        controller.abort();
      }, this.deadlineMs);
    });

    try {
      const completion = await Promise.race([
        work(claimed, controller.signal),
        deadline,
      ]);
      const final = await this.jobs.finishSucceeded(
        jobId,
        completion.result,
        this.now(),
      );
      await this.settleQuota(final.job);
    } catch (error) {
      const deadlineReached = error instanceof WorkerDeadlineError;
      const final = await this.jobs.finishFailed(
        jobId,
        deadlineReached
          ? {
              code: "WORKER_DEADLINE",
              message: "Task processing timed out.",
              retryable: true,
            }
          : {
              code: "JOB_FAILED",
              message: "Task processing failed.",
              retryable: true,
            },
        this.now(),
      );
      await this.settleQuota(final.job);
    } finally {
      if (deadlineHandle !== undefined) {
        clearTimeout(deadlineHandle);
      }
    }
    return true;
  }

  private async settleQuota(job: JobRecord): Promise<void> {
    if (job.quotaReservationId === undefined) {
      return;
    }
    if (job.status === "succeeded") {
      await this.quotas.succeed(job.quotaReservationId, this.now());
    } else {
      await this.quotas.release(job.quotaReservationId, this.now());
    }
  }
}
