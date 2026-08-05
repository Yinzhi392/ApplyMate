export const JOB_STATUSES = [
  "queued",
  "ocr",
  "parsing",
  "awaiting_user_confirmation",
  "generating",
  "validating",
  "succeeded",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Readonly<Record<JobStatus, string>> = {
  queued: "排队",
  ocr: "OCR",
  parsing: "解析",
  awaiting_user_confirmation: "等待用户确认",
  generating: "生成",
  validating: "校验",
  succeeded: "成功",
  failed: "失败",
};

const ALLOWED_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  queued: ["ocr", "parsing", "failed"],
  ocr: ["parsing", "failed"],
  parsing: [
    "awaiting_user_confirmation",
    "generating",
    "succeeded",
    "failed",
  ],
  awaiting_user_confirmation: ["generating", "succeeded", "failed"],
  generating: ["validating", "failed"],
  validating: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
