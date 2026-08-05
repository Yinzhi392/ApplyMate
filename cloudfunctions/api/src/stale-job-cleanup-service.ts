import type { JobRecord } from "./job-domain.js";
import type { JobService } from "./job-service.js";
import type { QuotaService } from "./quota-service.js";

export const STALE_JOB_AGE_MS = 10 * 60 * 1_000;

export interface StaleJobCleanupResult {
  candidates: number;
  failed: number;
}

export class StaleJobCleanupService {
  constructor(
    private readonly jobs: JobService,
    private readonly quotas: QuotaService,
  ) {}

  async run(now: Date): Promise<StaleJobCleanupResult> {
    const cutoff = new Date(now.getTime() - STALE_JOB_AGE_MS);
    const candidates = await this.jobs.listStaleJobs(cutoff);
    let failed = 0;

    for (const candidate of candidates) {
      const final = await this.jobs.finishFailed(
        candidate.jobId,
        {
          code: "JOB_STALE_TIMEOUT",
          message: "Task processing did not finish.",
          retryable: true,
        },
        now,
      );
      if (final.changed && final.job.status === "failed") {
        failed += 1;
      }
      await this.settleQuota(final.job, now);
    }

    return { candidates: candidates.length, failed };
  }

  private async settleQuota(job: JobRecord, now: Date): Promise<void> {
    if (job.quotaReservationId === undefined) {
      return;
    }
    if (job.status === "succeeded") {
      await this.quotas.succeed(job.quotaReservationId, now);
    } else {
      await this.quotas.release(job.quotaReservationId, now);
    }
  }
}
