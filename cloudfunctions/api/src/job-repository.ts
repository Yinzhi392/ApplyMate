import type { JobStatus } from "../../../shared/src/index.js";

import {
  isTerminalJobStatus,
  type JobError,
  type JobRecord,
} from "./job-domain.js";

export interface JobTransitionUpdates {
  result?: Record<string, unknown>;
  error?: JobError;
  quotaReservationId?: string;
  clearClaim?: boolean;
}

export interface JobRepository {
  createJob(job: JobRecord): Promise<void>;
  getJobById(jobId: string): Promise<JobRecord | null>;
  claimJob(jobId: string, workerId: string, now: Date): Promise<JobRecord | null>;
  transitionJob(
    jobId: string,
    expectedStatus: JobStatus,
    nextStatus: JobStatus,
    now: Date,
    updates?: JobTransitionUpdates,
  ): Promise<JobRecord | null>;
  listStaleJobs(updatedAtOrBefore: Date): Promise<JobRecord[]>;
  deleteByUserId(userId: string): Promise<number>;
}

function cloneJob(job: JobRecord): JobRecord {
  return structuredClone(job);
}

export class InMemoryJobRepository implements JobRepository {
  readonly #jobs = new Map<string, JobRecord>();

  async createJob(job: JobRecord): Promise<void> {
    if (this.#jobs.has(job.jobId)) {
      throw new Error("Job identifier must be unique.");
    }
    this.#jobs.set(job.jobId, cloneJob(job));
  }

  async getJobById(jobId: string): Promise<JobRecord | null> {
    const job = this.#jobs.get(jobId);
    return job === undefined ? null : cloneJob(job);
  }

  async claimJob(
    jobId: string,
    workerId: string,
    now: Date,
  ): Promise<JobRecord | null> {
    const job = this.#jobs.get(jobId);
    if (
      job === undefined ||
      job.claimedBy !== undefined ||
      isTerminalJobStatus(job.status)
    ) {
      return null;
    }

    const claimed: JobRecord = {
      ...job,
      claimedBy: workerId,
      claimedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.#jobs.set(jobId, claimed);
    return cloneJob(claimed);
  }

  async transitionJob(
    jobId: string,
    expectedStatus: JobStatus,
    nextStatus: JobStatus,
    now: Date,
    updates: JobTransitionUpdates = {},
  ): Promise<JobRecord | null> {
    const job = this.#jobs.get(jobId);
    if (job === undefined || job.status !== expectedStatus) {
      return null;
    }

    const timestamp = now.toISOString();
    const { clearClaim = false, ...recordUpdates } = updates;
    const updated: JobRecord = {
      ...job,
      status: nextStatus,
      statusHistory: [
        ...job.statusHistory,
        { status: nextStatus, enteredAt: timestamp },
      ],
      updatedAt: timestamp,
      ...recordUpdates,
    };
    if (clearClaim) {
      delete updated.claimedBy;
      delete updated.claimedAt;
    }
    this.#jobs.set(jobId, updated);
    return cloneJob(updated);
  }

  async listStaleJobs(updatedAtOrBefore: Date): Promise<JobRecord[]> {
    return Array.from(this.#jobs.values())
      .filter(
        (job) =>
          !isTerminalJobStatus(job.status) &&
          job.status !== "awaiting_user_confirmation" &&
          new Date(job.updatedAt).getTime() <= updatedAtOrBefore.getTime(),
      )
      .map(cloneJob);
  }

  async deleteByUserId(userId: string): Promise<number> {
    let deleted = 0;
    for (const [jobId, job] of this.#jobs) {
      if (job.userId === userId && this.#jobs.delete(jobId)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}
