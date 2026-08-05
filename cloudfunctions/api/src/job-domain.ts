import type { JobStatus } from "../../../shared/src/index.js";

export const JOB_KINDS = [
  "resume_parse",
  "greeting_generate",
  "greeting_rewrite",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export interface JobStatusEntry {
  status: JobStatus;
  enteredAt: string;
}

export interface JobError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobRecord {
  jobId: string;
  userId: string;
  kind: JobKind;
  status: JobStatus;
  statusHistory: JobStatusEntry[];
  claimedBy?: string;
  claimedAt?: string;
  quotaReservationId?: string;
  result?: Record<string, unknown>;
  error?: JobError;
  createdAt: string;
  updatedAt: string;
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}
