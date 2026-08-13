import {
  evaluateJobDescription,
  validateAiGreetingForJob,
  type EvidenceSourceRegistry,
  type GenerationDisclosureSnapshot,
  type GreetingDraft,
  type JobDescription,
} from "../../../shared/src/index.js";

import type { ApplicationRepository } from "./application-repository.js";
import { DomainError } from "./domain-error.js";
import type { RewriteRecord } from "./generation-rewrite-domain.js";
import type { RewriteRepository } from "./generation-rewrite-repository.js";
import type { JobService } from "./job-service.js";
import type { QuotaService } from "./quota-service.js";

export interface RewriteGenerationRequest {
  mode: "rewrite" | "correction";
  rewriteMode: RewriteRecord["rewriteMode"];
  latestText: string;
  companyDisplayName: string;
  jobTitle: string;
  customInstruction?: string;
  previousDraft?: GreetingDraft;
  qualityErrors?: string[];
}

export interface GreetingRewriter {
  rewrite(
    record: RewriteRecord,
    request: RewriteGenerationRequest,
    signal?: AbortSignal,
  ): Promise<{
    draft: GreetingDraft;
    generationDisclosure: GenerationDisclosureSnapshot;
  }>;
}

export interface GenerationRewriteExecutionDependencies {
  applications: ApplicationRepository;
  jobs: JobService;
  rewrites: RewriteRepository;
  quotas: QuotaService;
  rewriter: GreetingRewriter;
  now: () => Date;
}

const DEFAULT_REWRITE_DEADLINE_MS = 44_000;
const PLATFORM_REWRITE_LIMIT_MS = 45_000;

class RewriteWorkerDeadlineError extends Error {
  constructor() {
    super("Greeting rewrite timed out.");
    this.name = "RewriteWorkerDeadlineError";
  }
}

class RewriteQualityFailure extends Error {
  constructor() {
    super("Rewritten content did not pass factual checks. Please retry.");
    this.name = "RewriteQualityFailure";
  }
}

function jobDescriptionFieldIds(jd: JobDescription): Set<string> {
  return new Set(
    [
      jd.jobTitle,
      jd.companyName,
      ...jd.responsibilities,
      ...jd.hardSkills,
      ...jd.experienceEducation,
      ...jd.locationWorkMode,
      ...jd.availabilityDuration,
    ]
      .filter((field) => field !== undefined)
      .map(({ fieldId }) => fieldId),
  );
}

function sourceRegistry(record: RewriteRecord): EvidenceSourceRegistry {
  return {
    factIds: new Set(record.factSnapshot.map(({ factId }) => factId)),
    jdFieldIds: jobDescriptionFieldIds(record.jdSnapshot),
  };
}

function stableRewriteError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof RewriteQualityFailure) {
    return {
      code: "GREETING_QUALITY_FAILED",
      message: error.message,
      retryable: true,
    };
  }
  if (error instanceof RewriteWorkerDeadlineError) {
    return {
      code: "WORKER_DEADLINE",
      message: error.message,
      retryable: true,
    };
  }
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (
    error instanceof Error &&
    error.name === "GenerationProcessingError" &&
    typeof Reflect.get(error, "code") === "string" &&
    typeof Reflect.get(error, "retryable") === "boolean"
  ) {
    return {
      code: Reflect.get(error, "code") as string,
      message: error.message,
      retryable: Reflect.get(error, "retryable") as boolean,
    };
  }
  return {
    code: "JOB_FAILED",
    message: "Greeting rewrite failed.",
    retryable: true,
  };
}

export class GenerationRewriteExecutionService {
  constructor(
    private readonly dependencies: GenerationRewriteExecutionDependencies,
    private readonly deadlineMs = DEFAULT_REWRITE_DEADLINE_MS,
  ) {
    if (
      !Number.isSafeInteger(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs >= PLATFORM_REWRITE_LIMIT_MS
    ) {
      throw new RangeError("Rewrite worker deadline must be below 45 seconds.");
    }
  }

  async run(jobId: string, workerId: string, startedAt: Date): Promise<boolean> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new RewriteWorkerDeadlineError());
      }, this.deadlineMs);
    });
    try {
      return await Promise.race([
        this.runWithinDeadline(jobId, workerId, startedAt, controller.signal),
        deadline,
      ]);
    } catch (error) {
      const record = await this.dependencies.rewrites.getByJobId(jobId);
      if (record === null) {
        return false;
      }
      await this.fail(record, error);
      return true;
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async runWithinDeadline(
    jobId: string,
    workerId: string,
    startedAt: Date,
    signal: AbortSignal,
  ): Promise<boolean> {
    const record = await this.dependencies.rewrites.getByJobId(jobId);
    if (record === null || record.status !== "processing") {
      return false;
    }
    const job = await this.dependencies.jobs.getJobForUser(record.userId, jobId);
    if (job.status !== "queued") {
      return false;
    }
    const claimed = await this.dependencies.jobs.claimJob(jobId, workerId, startedAt);
    if (claimed === null) {
      return false;
    }
    await this.dependencies.jobs.transitionJob(
      jobId,
      "parsing",
      this.dependencies.now(),
    );

    const reservationId = `quota_${jobId}`;
    let reserved = false;
    try {
      await this.dependencies.quotas.reserve(
        record.userId,
        reservationId,
        this.dependencies.now(),
      );
      reserved = true;
      await this.dependencies.jobs.transitionJob(
        jobId,
        "generating",
        this.dependencies.now(),
        { quotaReservationId: reservationId },
      );

      const jdEvaluation = evaluateJobDescription(record.jdSnapshot);
      const jobTitle = record.jdSnapshot.jobTitle?.text;
      if (jdEvaluation.status !== "ready" || jobTitle === undefined) {
        throw new DomainError("CONFLICT", "Application JD snapshot is incomplete.");
      }
      const baseRequest: RewriteGenerationRequest = {
        mode: "rewrite",
        rewriteMode: record.rewriteMode,
        latestText: record.sourceBody,
        companyDisplayName: jdEvaluation.companyDisplayName,
        jobTitle,
        ...(record.customInstruction === undefined
          ? {}
          : { customInstruction: record.customInstruction }),
      };
      let rewritten = await this.dependencies.rewriter.rewrite(
        record,
        baseRequest,
        signal,
      );
      let draft = rewritten.draft;
      let generationDisclosure = rewritten.generationDisclosure;
      await this.dependencies.jobs.transitionJob(
        jobId,
        "validating",
        this.dependencies.now(),
      );
      const registry = sourceRegistry(record);
      let quality = validateAiGreetingForJob(
        draft,
        registry,
        jdEvaluation.companyDisplayName,
        jobTitle,
      );
      if (!quality.valid) {
        const previousDraft = draft;
        rewritten = await this.dependencies.rewriter.rewrite(
          record,
          {
            ...baseRequest,
            mode: "correction",
            previousDraft,
            qualityErrors: quality.errors,
          },
          signal,
        );
        draft = rewritten.draft;
        generationDisclosure = rewritten.generationDisclosure;
        quality = validateAiGreetingForJob(
          draft,
          registry,
          jdEvaluation.companyDisplayName,
          jobTitle,
        );
      }
      if (!quality.valid) {
        throw new RewriteQualityFailure();
      }

      const current = await this.dependencies.applications.getById(
        record.applicationId,
      );
      if (current === null || current.userId !== record.userId) {
        throw new DomainError("NOT_FOUND", "Application was not found.");
      }
      if (
        current.updatedAt !== record.sourceApplicationUpdatedAt ||
        current.greetingBody !== record.sourceBody
      ) {
        throw new DomainError(
          "CONFLICT",
          "Application text changed while the rewrite was running.",
        );
      }
      const timestamp = this.dependencies.now().toISOString();
      const updated = {
        ...current,
        greetingBody: draft.body,
        evidence: structuredClone(draft.claims),
        omittedRequirements: [...draft.omittedRequirements],
        warnings: Array.from(new Set([...record.warnings, ...draft.warnings])),
        manualWarnings: [],
        generationDisclosure,
        updatedAt: timestamp,
      };
      const saved = await this.dependencies.applications.saveIfUpdatedAt(
        updated,
        record.sourceApplicationUpdatedAt,
      );
      if (saved === null) {
        throw new DomainError(
          "CONFLICT",
          "Application text changed while the rewrite was running.",
        );
      }
      const final = await this.dependencies.jobs.finishSucceeded(
        jobId,
        {
          applicationId: record.applicationId,
          greeting: draft,
          warnings: updated.warnings,
          omittedRequirements: draft.omittedRequirements,
        },
        this.dependencies.now(),
      );
      if (final.job.status !== "succeeded") {
        await this.dependencies.applications.saveIfUpdatedAt(
          current,
          timestamp,
        );
        await this.dependencies.quotas.release(
          reservationId,
          this.dependencies.now(),
        );
        await this.dependencies.rewrites.save({
          ...record,
          status: "failed",
          updatedAt: timestamp,
        });
        return true;
      }
      await this.dependencies.quotas.succeed(
        reservationId,
        this.dependencies.now(),
      );
      await this.dependencies.rewrites.save({
        ...record,
        status: "succeeded",
        updatedAt: timestamp,
      });
      return true;
    } catch (error) {
      if (reserved) {
        const currentJob = await this.dependencies.jobs.getJobForUser(
          record.userId,
          jobId,
        );
        if (currentJob.quotaReservationId === undefined) {
          await this.dependencies.quotas.release(
            reservationId,
            this.dependencies.now(),
          );
        }
      }
      await this.fail(record, error);
      return true;
    }
  }

  private async fail(record: RewriteRecord, error: unknown): Promise<void> {
    const final = await this.dependencies.jobs.finishFailed(
      record.jobId,
      stableRewriteError(error),
      this.dependencies.now(),
    );
    if (final.job.quotaReservationId !== undefined) {
      if (final.job.status === "succeeded") {
        await this.dependencies.quotas.succeed(
          final.job.quotaReservationId,
          this.dependencies.now(),
        );
      } else {
        await this.dependencies.quotas.release(
          final.job.quotaReservationId,
          this.dependencies.now(),
        );
      }
    }
    await this.dependencies.rewrites.save({
      ...record,
      status: final.job.status === "succeeded" ? "succeeded" : "failed",
      updatedAt: this.dependencies.now().toISOString(),
    });
  }
}
