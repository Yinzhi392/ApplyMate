import type { JobStatus } from "../../../shared/src/index.js";

import {
  isTerminalJobStatus,
  type JobError,
  type JobRecord,
} from "./job-domain.js";

export interface JobTransitionUpdates {
  result?: Record<string, unknown>;
  error?: JobError;
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
  listStaleJobs(createdAtOrBefore: Date): Promise<JobRecord[]>;
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
    const updated: JobRecord = {
      ...job,
      status: nextStatus,
      statusHistory: [
        ...job.statusHistory,
        { status: nextStatus, enteredAt: timestamp },
      ],
      updatedAt: timestamp,
      ...updates,
    };
    this.#jobs.set(jobId, updated);
    return cloneJob(updated);
  }

  async listStaleJobs(createdAtOrBefore: Date): Promise<JobRecord[]> {
    return Array.from(this.#jobs.values())
      .filter(
        (job) =>
          !isTerminalJobStatus(job.status) &&
          job.status !== "awaiting_user_confirmation" &&
          new Date(job.createdAt).getTime() <= createdAtOrBefore.getTime(),
      )
      .map(cloneJob);
  }
}
