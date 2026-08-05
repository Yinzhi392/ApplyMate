import {
  evaluateJobDescription,
  type JobDescription,
  type SensitiveDataType,
} from "../../../shared/src/index.js";

import type { GenerationRecord } from "./generation-domain.js";
import type { GenerationRepository } from "./generation-repository.js";
import type { JobService } from "./job-service.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

const DEFAULT_GENERATION_DEADLINE_MS = 44_000;
const PLATFORM_WORKER_LIMIT_MS = 45_000;

export interface GenerationPreparationResult {
  maskedText: string;
  jobDescription: JobDescription;
  maskedTypes: SensitiveDataType[];
  maskedCount: number;
}

export interface GenerationPreparationProcessor {
  extract(source: GenerationRecord, signal?: AbortSignal): Promise<string>;
  parse(extractedText: string): Promise<GenerationPreparationResult>;
}

export type GenerationPreparationOutcome =
  | { status: "ready"; record: GenerationRecord }
  | { status: "awaiting_confirmation"; record: GenerationRecord }
  | { status: "failed" };

class GenerationDeadlineError extends Error {
  constructor() {
    super("Generation preparation deadline reached.");
    this.name = "GenerationDeadlineError";
  }
}

function isStableGenerationError(
  error: unknown,
): error is { code: string; message: string; retryable: boolean } {
  return (
    error instanceof Error &&
    (error.name === "GenerationProcessingError" ||
      error.name === "ResumeProcessingError") &&
    typeof Reflect.get(error, "code") === "string" &&
    typeof Reflect.get(error, "retryable") === "boolean"
  );
}

export class GenerationPreparationService {
  constructor(
    private readonly jobs: JobService,
    private readonly generations: GenerationRepository,
    private readonly temporaryFiles: TemporaryFileService,
    private readonly processor: GenerationPreparationProcessor,
    private readonly now: () => Date = () => new Date(),
    private readonly deadlineMs = DEFAULT_GENERATION_DEADLINE_MS,
  ) {
    if (
      !Number.isSafeInteger(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs >= PLATFORM_WORKER_LIMIT_MS
    ) {
      throw new RangeError("Generation deadline must be below 45 seconds.");
    }
  }

  async run(
    jobId: string,
    workerId: string,
    startedAt: Date,
    externalSignal?: AbortSignal,
  ): Promise<GenerationPreparationOutcome | false> {
    const claimed = await this.jobs.claimJob(jobId, workerId, startedAt);
    if (claimed === null) {
      return false;
    }
    const record = await this.generations.getByJobId(jobId);
    if (record === null || record.userId !== claimed.userId) {
      await this.jobs.finishFailed(
        jobId,
        {
          code: "GENERATION_NOT_FOUND",
          message: "Generation task was not found.",
          retryable: false,
        },
        this.now(),
      );
      return { status: "failed" };
    }

    const controller = new AbortController();
    let rejectExternalDeadline: ((error: GenerationDeadlineError) => void) | undefined;
    const abortFromParent = () => {
      controller.abort();
      rejectExternalDeadline?.(new GenerationDeadlineError());
    };
    let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineHandle = setTimeout(() => {
        controller.abort();
        reject(new GenerationDeadlineError());
      }, this.deadlineMs);
    });
    const externalDeadline = new Promise<never>((_resolve, reject) => {
      rejectExternalDeadline = reject;
      if (externalSignal?.aborted === true) {
        abortFromParent();
        return;
      }
      externalSignal?.addEventListener("abort", abortFromParent, { once: true });
    });
    let remainingTemporaryFileIds = [...record.temporaryFileIds];

    try {
      await this.jobs.transitionJob(
        jobId,
        record.inputType === "images" ? "ocr" : "parsing",
        startedAt,
      );
      let extracted: string;
      try {
        extracted = await Promise.race([
          this.processor.extract(record, controller.signal),
          deadline,
          externalDeadline,
        ]);
      } finally {
        if (record.inputType === "images") {
          remainingTemporaryFileIds = await this.deleteTemporaryFiles(
            record.userId,
            record.temporaryFileIds,
          );
        }
      }
      if (record.inputType === "images") {
        await this.jobs.transitionJob(jobId, "parsing", this.now());
      }
      const parsed = await Promise.race([
        this.processor.parse(extracted),
        deadline,
        externalDeadline,
      ]);
      const evaluation = evaluateJobDescription(parsed.jobDescription);
      const updated: GenerationRecord = {
        ...record,
        temporaryFileIds: remainingTemporaryFileIds,
        status:
          evaluation.status === "ready"
            ? "generating"
            : "awaiting_confirmation",
        extractedMaskedText: parsed.maskedText,
        jobDescription: parsed.jobDescription,
        pendingFieldIds: evaluation.confirmFieldIds,
        warnings: evaluation.warnings,
        updatedAt: this.now().toISOString(),
      };
      delete updated.sourceText;
      await this.generations.save(updated);

      if (evaluation.status === "awaiting_user_confirmation") {
        await this.jobs.transitionJob(
          jobId,
          "awaiting_user_confirmation",
          this.now(),
          {
            clearClaim: true,
            result: {
              jobDescription: parsed.jobDescription,
              pendingFieldIds:
                parsed.jobDescription.jobTitle === undefined
                  ? ["jobTitle", ...evaluation.confirmFieldIds]
                  : evaluation.confirmFieldIds,
              warnings: evaluation.warnings,
              privacy: {
                maskedTypes: parsed.maskedTypes,
                maskedCount: parsed.maskedCount,
              },
            },
          },
        );
        return { status: "awaiting_confirmation", record: updated };
      }
      return { status: "ready", record: updated };
    } catch (error) {
      const deadlineReached = error instanceof GenerationDeadlineError;
      await this.jobs.finishFailed(
        jobId,
        deadlineReached
          ? {
              code: "WORKER_DEADLINE",
              message: "JD processing timed out.",
              retryable: true,
            }
          : isStableGenerationError(error)
            ? {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
              }
            : {
                code: "JOB_FAILED",
                message: "JD processing failed.",
                retryable: true,
              },
        this.now(),
      );
      const failedRecord: GenerationRecord = {
        ...record,
        temporaryFileIds: remainingTemporaryFileIds,
        status: "failed",
        updatedAt: this.now().toISOString(),
      };
      delete failedRecord.sourceText;
      await this.generations.save(failedRecord);
      return { status: "failed" };
    } finally {
      if (deadlineHandle !== undefined) {
        clearTimeout(deadlineHandle);
      }
      externalSignal?.removeEventListener("abort", abortFromParent);
    }
  }

  private async deleteTemporaryFiles(
    userId: string,
    fileIds: readonly string[],
  ): Promise<string[]> {
    const remaining: string[] = [];
    for (const fileId of fileIds) {
      try {
        await this.temporaryFiles.deleteOwnedFile(userId, fileId);
      } catch (error) {
        const notFound =
          error !== null &&
          typeof error === "object" &&
          Reflect.get(error, "code") === "NOT_FOUND";
        if (!notFound) {
          remaining.push(fileId);
        }
      }
    }
    return remaining;
  }
}
