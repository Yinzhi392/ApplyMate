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
  createdAt?: string;
  jobId: string;
  kind: "resume_parse" | "greeting_generate" | "greeting_rewrite";
  status: ClientJobStatus;
  statusLabel: string;
  result?: Record<string, unknown>;
  resultPreview?: ClientResultPreview;
  error?: { code: string; message: string; retryable: boolean };
}

export interface ClientResultPreview {
  applicationId: string;
  companyName: string;
  generationDisclosure?: Record<string, unknown>;
  greetingBody: string;
  jobTitle: string;
}

export interface JobProgressView {
  activeStep: number;
  progress: number;
  steps: string[];
  subtitle: string;
  title: string;
}

export const FAST_JOB_POLL_DELAYS_MS = [
  250,
  350,
  450,
  550,
  650,
  750,
  850,
  950,
  1_000,
  1_000,
  1_000,
  1_000,
  1_200,
  1_500,
  2_000,
  2_500,
  3_000,
  4_000,
  5_000,
  6_000,
  7_000,
] as const;

const STATUS_PROGRESS: Record<ClientJobStatus, number> = {
  queued: 12,
  ocr: 30,
  parsing: 52,
  awaiting_user_confirmation: 94,
  generating: 76,
  validating: 90,
  succeeded: 100,
  failed: 100,
};

export function createJobProgressView(
  kind: ClientJob["kind"],
  status: ClientJobStatus,
): JobProgressView {
  if (kind === "resume_parse") {
    return {
      activeStep: status === "queued" || status === "ocr" ? 0 : status === "parsing" ? 1 : 2,
      progress: STATUS_PROGRESS[status],
      steps: ["读取简历内容", "识别并整理个人事实", "准备一次性资料核对"],
      subtitle: "解析完成后，只需核对一次个人资料。",
      title: "正在解析简历",
    };
  }
  if (kind === "greeting_rewrite") {
    return {
      activeStep: status === "queued" || status === "parsing" ? 0 : status === "generating" ? 1 : 2,
      progress: STATUS_PROGRESS[status],
      steps: ["读取最新正文", "按照要求改写", "重新检查事实来源与格式"],
      subtitle: "基于你最新编辑的正文改写，并重新检查事实。",
      title: "正在改写开场白",
    };
  }
  return {
    activeStep: status === "queued" || status === "ocr" ? 0 : status === "parsing" ? 1 : status === "generating" ? 2 : 3,
    progress: STATUS_PROGRESS[status],
    steps: ["读取岗位输入", "识别岗位职责与要求", "匹配简历事实并生成", "检查事实来源与格式"],
    subtitle: "岗位识别后会直接生成，无需再次确认。",
    title: "正在生成开场白",
  };
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
