import type { JobKind, JobRecord } from "./job-domain.js";
import type { JobService } from "./job-service.js";

export interface JobDispatchPort {
  dispatch(jobId: string): void;
}

export class JobDispatchService {
  constructor(
    private readonly jobs: JobService,
    private readonly dispatcher: JobDispatchPort,
  ) {}

  async createAndDispatch(
    userId: string,
    kind: JobKind,
    now: Date,
    quotaReservationId?: string,
  ): Promise<JobRecord> {
    const job = await this.jobs.createJob(
      userId,
      kind,
      now,
      quotaReservationId,
    );
    this.dispatcher.dispatch(job.jobId);
    return job;
  }
}

export class JobWorkerCoordinator {
  constructor(private readonly jobs: JobService) {}

  async runClaimed(
    jobId: string,
    workerId: string,
    now: Date,
    process: (job: JobRecord) => Promise<void>,
  ): Promise<boolean> {
    const claimed = await this.jobs.claimJob(jobId, workerId, now);
    if (claimed === null) {
      return false;
    }
    await process(claimed);
    return true;
  }
}
