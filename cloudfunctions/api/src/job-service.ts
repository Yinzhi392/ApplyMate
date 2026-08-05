import { randomUUID } from "node:crypto";

import {
  canTransitionJob,
  type JobStatus,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import {
  isTerminalJobStatus,
  type JobError,
  type JobKind,
  type JobRecord,
} from "./job-domain.js";
import type {
  JobRepository,
  JobTransitionUpdates,
} from "./job-repository.js";

export interface JobFinishResult {
  changed: boolean;
  job: JobRecord;
}

export class JobService {
  constructor(
    private readonly repository: JobRepository,
    private readonly generateJobId: () => string = () => `job_${randomUUID()}`,
  ) {}

  async createJob(
    userId: string,
    kind: JobKind,
    now: Date,
    quotaReservationId?: string,
  ): Promise<JobRecord> {
    const timestamp = now.toISOString();
    const job: JobRecord = {
      jobId: this.generateJobId(),
      userId,
      kind,
      status: "queued",
      statusHistory: [{ status: "queued", enteredAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(quotaReservationId === undefined ? {} : { quotaReservationId }),
    };
    await this.repository.createJob(job);
    return job;
  }

  claimJob(
    jobId: string,
    workerId: string,
    now: Date,
  ): Promise<JobRecord | null> {
    return this.repository.claimJob(jobId, workerId, now);
  }

  async transitionJob(
    jobId: string,
    nextStatus: JobStatus,
    now: Date,
    updates: JobTransitionUpdates = {},
  ): Promise<JobRecord> {
    const current = await this.repository.getJobById(jobId);
    if (current === null) {
      throw new DomainError("NOT_FOUND", "Job was not found.");
    }
    if (!canTransitionJob(current.status, nextStatus)) {
      throw new DomainError("CONFLICT", "Job status transition is invalid.");
    }

    const updated = await this.repository.transitionJob(
      jobId,
      current.status,
      nextStatus,
      now,
      updates,
    );
    if (updated === null) {
      throw new DomainError("CONFLICT", "Job status changed concurrently.");
    }
    return updated;
  }

  async getJobForUser(userId: string, jobId: string): Promise<JobRecord> {
    const job = await this.repository.getJobById(jobId);
    if (job === null || job.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Job was not found.");
    }
    return job;
  }

  listStaleJobs(createdAtOrBefore: Date): Promise<JobRecord[]> {
    return this.repository.listStaleJobs(createdAtOrBefore);
  }

  finishSucceeded(
    jobId: string,
    result: Record<string, unknown>,
    now: Date,
  ): Promise<JobFinishResult> {
    return this.finishJob(jobId, "succeeded", now, { result });
  }

  finishFailed(
    jobId: string,
    error: JobError,
    now: Date,
  ): Promise<JobFinishResult> {
    return this.finishJob(jobId, "failed", now, { error });
  }

  private async finishJob(
    jobId: string,
    terminalStatus: "succeeded" | "failed",
    now: Date,
    updates: JobTransitionUpdates,
  ): Promise<JobFinishResult> {
    const current = await this.repository.getJobById(jobId);
    if (current === null) {
      throw new DomainError("NOT_FOUND", "Job was not found.");
    }
    if (isTerminalJobStatus(current.status)) {
      return { changed: false, job: current };
    }
    if (!canTransitionJob(current.status, terminalStatus)) {
      throw new DomainError("CONFLICT", "Job cannot enter that terminal state.");
    }

    const updated = await this.repository.transitionJob(
      jobId,
      current.status,
      terminalStatus,
      now,
      updates,
    );
    if (updated !== null) {
      return { changed: true, job: updated };
    }

    const raced = await this.repository.getJobById(jobId);
    if (raced !== null && isTerminalJobStatus(raced.status)) {
      return { changed: false, job: raced };
    }
    throw new DomainError("CONFLICT", "Job status changed concurrently.");
  }
}
