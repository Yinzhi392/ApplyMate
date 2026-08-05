import type {
  ResumeProfile,
  SensitiveDataType,
} from "../../../shared/src/index.js";

import type { JobService } from "./job-service.js";
import type { ResumeRecord } from "./resume-domain.js";
import type { ResumeRepository } from "./resume-repository.js";

const DEFAULT_RESUME_WORKER_DEADLINE_MS = 44_000;
const PLATFORM_WORKER_LIMIT_MS = 45_000;

export interface ResumeParseProcessorResult {
  profile: ResumeProfile;
  maskedTypes: SensitiveDataType[];
  maskedCount: number;
}

export interface ResumeParseProcessor {
  extract(source: ResumeRecord, signal?: AbortSignal): Promise<string>;
  parseExtracted(
    extractedText: string,
    resumeId: string,
  ): Promise<ResumeParseProcessorResult>;
}

class ResumeWorkerDeadlineError extends Error {
  constructor() {
    super("Resume worker deadline reached.");
    this.name = "ResumeWorkerDeadlineError";
  }
}

function isStableProcessingError(
  error: unknown,
): error is { code: string; message: string; retryable: boolean } {
  return (
    error instanceof Error &&
    error.name === "ResumeProcessingError" &&
    typeof Reflect.get(error, "code") === "string" &&
    typeof Reflect.get(error, "retryable") === "boolean"
  );
}

export class ResumeParseExecutionService {
  constructor(
    private readonly jobs: JobService,
    private readonly resumes: ResumeRepository,
    private readonly processor: ResumeParseProcessor,
    private readonly now: () => Date = () => new Date(),
    private readonly deadlineMs = DEFAULT_RESUME_WORKER_DEADLINE_MS,
  ) {
    if (
      !Number.isSafeInteger(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs >= PLATFORM_WORKER_LIMIT_MS
    ) {
      throw new RangeError("Resume worker deadline must be below 45 seconds.");
    }
  }

  async run(jobId: string, workerId: string, startedAt: Date): Promise<boolean> {
    const claimed = await this.jobs.claimJob(jobId, workerId, startedAt);
    if (claimed === null) {
      return false;
    }
    const draft = await this.resumes.getByJobId(jobId);
    if (draft === null || draft.userId !== claimed.userId) {
      await this.jobs.finishFailed(
        jobId,
        {
          code: "RESUME_DRAFT_NOT_FOUND",
          message: "Resume draft was not found.",
          retryable: false,
        },
        this.now(),
      );
      return true;
    }

    const controller = new AbortController();
    let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineHandle = setTimeout(() => {
        controller.abort();
        reject(new ResumeWorkerDeadlineError());
      }, this.deadlineMs);
    });

    try {
      if (draft.inputType === "images") {
        await this.jobs.transitionJob(jobId, "ocr", startedAt);
      } else {
        await this.jobs.transitionJob(jobId, "parsing", startedAt);
      }
      const extracted = await Promise.race([
        this.processor.extract(draft, controller.signal),
        deadline,
      ]);
      if (draft.inputType === "images") {
        await this.jobs.transitionJob(jobId, "parsing", this.now());
      }
      const parsed = await Promise.race([
        this.processor.parseExtracted(extracted, draft.resumeId),
        deadline,
      ]);

      const updated: ResumeRecord = {
        ...draft,
        status: "awaiting_confirmation",
        profile: parsed.profile,
        updatedAt: this.now().toISOString(),
      };
      delete updated.sourceText;
      await this.resumes.save(updated);
      await this.jobs.transitionJob(
        jobId,
        "awaiting_user_confirmation",
        this.now(),
        {
          result: {
            resumeId: draft.resumeId,
            profile: parsed.profile,
            privacy: {
              maskedTypes: parsed.maskedTypes,
              maskedCount: parsed.maskedCount,
            },
          },
        },
      );
    } catch (error) {
      const deadlineReached = error instanceof ResumeWorkerDeadlineError;
      await this.jobs.finishFailed(
        jobId,
        deadlineReached
          ? {
              code: "WORKER_DEADLINE",
              message: "Resume processing timed out.",
              retryable: true,
            }
          : isStableProcessingError(error)
            ? {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
              }
            : {
                code: "JOB_FAILED",
                message: "Resume processing failed.",
                retryable: true,
              },
        this.now(),
      );
      await this.resumes.save({
        ...draft,
        status: "failed",
        updatedAt: this.now().toISOString(),
      });
    } finally {
      if (deadlineHandle !== undefined) {
        clearTimeout(deadlineHandle);
      }
    }
    return true;
  }
}
