export type ClientJobStatus =
  | "queued"
  | "ocr"
  | "parsing"
  | "awaiting_user_confirmation"
  | "generating"
  | "validating"
  | "succeeded"
  | "failed";

export interface ClientJob {
  jobId: string;
  kind: "resume_parse" | "greeting_generate" | "greeting_rewrite";
  status: ClientJobStatus;
  statusLabel: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
}

export class JobPollingError extends Error {
  constructor(
    public readonly code: "POLLING_PAUSED" | "JOB_FAILED",
    message: string,
    public readonly retryable: boolean,
    public readonly job?: ClientJob,
  ) {
    super(message);
    this.name = "JobPollingError";
  }
}

export interface JobPollerDependencies {
  getJob(jobId: string): Promise<ClientJob>;
  wait(delayMs: number): Promise<void>;
  delaysMs?: readonly number[];
}

export function createJobPoller(dependencies: JobPollerDependencies): {
  poll(jobId: string, onUpdate: (job: ClientJob) => void): Promise<ClientJob>;
} {
  const delaysMs = dependencies.delaysMs ?? [0, 800, 1_200, 2_000, 3_000, 5_000];
  return {
    async poll(jobId: string, onUpdate: (job: ClientJob) => void): Promise<ClientJob> {
      for (let index = 0; index < delaysMs.length; index += 1) {
        const job = await dependencies.getJob(jobId);
        onUpdate(job);
        if (job.status === "succeeded" || job.status === "awaiting_user_confirmation") {
          return job;
        }
        if (job.status === "failed") {
          throw new JobPollingError(
            "JOB_FAILED",
            job.error?.message ?? "任务处理失败，请重试。",
            job.error?.retryable ?? true,
            job,
          );
        }
        if (index < delaysMs.length - 1) {
          await dependencies.wait(delaysMs[index] ?? 0);
        }
      }
      throw new JobPollingError(
        "POLLING_PAUSED",
        "任务仍在处理中，可稍后手动刷新。",
        true,
      );
    },
  };
}
