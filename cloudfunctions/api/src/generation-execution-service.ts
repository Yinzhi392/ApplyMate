import {
  evaluateJobDescription,
  maskSensitiveText,
  validateAiGreetingForJob,
  type GreetingDraft,
  type JobDescription,
  type ResumeProfile,
} from "../../../shared/src/index.js";

import type {
  ApplicationFactSnapshot,
  ApplicationRecord,
} from "./application-domain.js";
import type { ApplicationRepository } from "./application-repository.js";
import { DomainError } from "./domain-error.js";
import type { GenerationRecord } from "./generation-domain.js";
import type { GenerationPreparationService } from "./generation-preparation-service.js";
import type { GenerationRepository } from "./generation-repository.js";
import type { JobService } from "./job-service.js";
import type { QuotaService } from "./quota-service.js";

export interface GenerationRequest {
  mode: "initial" | "correction";
  companyDisplayName: string;
  jobTitle: string;
  previousDraft?: GreetingDraft;
  qualityErrors?: string[];
}

export interface GreetingGenerator {
  generate(
    record: GenerationRecord,
    request: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<GreetingDraft>;
}

export interface GenerationExecutionDependencies {
  preparation: GenerationPreparationService;
  jobs: JobService;
  generations: GenerationRepository;
  quotas: QuotaService;
  applications: ApplicationRepository;
  generator: GreetingGenerator;
  now: () => Date;
}

const DEFAULT_GENERATION_WORKER_DEADLINE_MS = 44_000;
const PLATFORM_GENERATION_WORKER_LIMIT_MS = 45_000;

class GenerationWorkerDeadlineError extends Error {
  constructor() {
    super("Greeting generation timed out.");
    this.name = "GenerationWorkerDeadlineError";
  }
}

class GreetingQualityFailure extends Error {
  constructor() {
    super("Generated content did not pass factual checks. Please retry.");
    this.name = "GreetingQualityFailure";
  }
}

type ResumeFact = ResumeProfile[
  | "education"
  | "experiences"
  | "projects"
  | "skills"
  | "languages"
  | "certificates"
  | "achievements"
  | "preferences"
  | "otherFacts"
][number];

function resumeFacts(profile: ResumeProfile): ResumeFact[] {
  return [
    ...profile.education,
    ...profile.experiences,
    ...profile.projects,
    ...profile.skills,
    ...profile.languages,
    ...profile.certificates,
    ...profile.achievements,
    ...profile.preferences,
    ...profile.otherFacts,
  ];
}

function jdFieldIds(jd: JobDescription): Set<string> {
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

function sanitizeJobDescription(jd: JobDescription): JobDescription {
  const sanitizeField = <T extends { text: string }>(field: T): T => ({
    ...field,
    text: maskSensitiveText(field.text).text,
  });
  return {
    ...(jd.jobTitle === undefined ? {} : { jobTitle: sanitizeField(jd.jobTitle) }),
    ...(jd.companyName === undefined
      ? {}
      : { companyName: sanitizeField(jd.companyName) }),
    responsibilities: jd.responsibilities.map(sanitizeField),
    hardSkills: jd.hardSkills.map(sanitizeField),
    experienceEducation: jd.experienceEducation.map(sanitizeField),
    locationWorkMode: jd.locationWorkMode.map(sanitizeField),
    availabilityDuration: jd.availabilityDuration.map(sanitizeField),
  };
}

function referencedFactSnapshot(
  record: GenerationRecord,
  draft: GreetingDraft,
): ApplicationFactSnapshot[] {
  const referenced = new Set(
    draft.claims.flatMap(({ sources }) =>
      sources.flatMap((source) =>
        source.type === "fact" ? [source.factId] : [],
      ),
    ),
  );
  const facts = [
    ...resumeFacts(record.resumeSnapshot),
    ...record.preferenceSnapshot,
  ];
  return facts
    .filter(({ factId }) => referenced.has(factId))
    .map(({ factId, sourceType, text }) => ({
      factId,
      sourceType,
      text: maskSensitiveText(text).text,
    }));
}

function stableProcessingError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof GreetingQualityFailure) {
    return {
      code: "GREETING_QUALITY_FAILED",
      message: error.message,
      retryable: true,
    };
  }
  if (error instanceof GenerationWorkerDeadlineError) {
    return {
      code: "WORKER_DEADLINE",
      message: "Greeting generation timed out.",
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
    message: "Greeting generation failed.",
    retryable: true,
  };
}

export class GenerationExecutionService {
  constructor(
    private readonly dependencies: GenerationExecutionDependencies,
    private readonly deadlineMs = DEFAULT_GENERATION_WORKER_DEADLINE_MS,
  ) {
    if (
      !Number.isSafeInteger(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs >= PLATFORM_GENERATION_WORKER_LIMIT_MS
    ) {
      throw new RangeError("Generation worker deadline must be below 45 seconds.");
    }
  }

  async run(jobId: string, workerId: string, startedAt: Date): Promise<boolean> {
    const controller = new AbortController();
    let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineHandle = setTimeout(() => {
        controller.abort();
        reject(new GenerationWorkerDeadlineError());
      }, this.deadlineMs);
    });
    try {
      return await Promise.race([
        this.runWithinDeadline(jobId, workerId, startedAt, controller.signal),
        deadline,
      ]);
    } catch (error) {
      const record = await this.dependencies.generations.getByJobId(jobId);
      if (record === null) {
        return false;
      }
      await this.fail(record, error);
      return true;
    } finally {
      if (deadlineHandle !== undefined) {
        clearTimeout(deadlineHandle);
      }
    }
  }

  private async runWithinDeadline(
    jobId: string,
    workerId: string,
    startedAt: Date,
    signal: AbortSignal,
  ): Promise<boolean> {
    let record = await this.dependencies.generations.getByJobId(jobId);
    if (record === null) {
      return false;
    }
    let job = await this.dependencies.jobs.getJobForUser(record.userId, jobId);
    if (job.status === "queued") {
      const preparation = await this.dependencies.preparation.run(
        jobId,
        workerId,
        startedAt,
        signal,
      );
      if (preparation === false) {
        return false;
      }
      if (preparation.status !== "ready") {
        return true;
      }
      record = preparation.record;
      const reservationId = `quota_${jobId}`;
      let quotaReserved = false;
      try {
        await this.dependencies.quotas.reserve(record.userId, reservationId, this.dependencies.now());
        quotaReserved = true;
        job = await this.dependencies.jobs.transitionJob(
          jobId,
          "generating",
          this.dependencies.now(),
          { quotaReservationId: reservationId },
        );
      } catch (error) {
        if (quotaReserved) {
          await this.dependencies.quotas.release(
            reservationId,
            this.dependencies.now(),
          );
        }
        await this.fail(record, error);
        return true;
      }
    } else if (job.status === "generating") {
      const claimed = await this.dependencies.jobs.claimJob(jobId, workerId, startedAt);
      if (claimed === null) {
        return false;
      }
      job = claimed;
    } else {
      return false;
    }

    try {
      const jd = record.jobDescription;
      if (jd === undefined || jd.jobTitle === undefined) {
        throw new DomainError("CONFLICT", "Confirmed JD is missing.");
      }
      const evaluation = evaluateJobDescription(jd);
      if (evaluation.status !== "ready") {
        throw new DomainError("CONFLICT", "Confirmed JD is incomplete.");
      }
      const companyDisplayName = evaluation.companyDisplayName;
      const request = {
        mode: "initial" as const,
        companyDisplayName,
        jobTitle: jd.jobTitle.text,
      };
      let draft = await this.dependencies.generator.generate(
        record,
        request,
        signal,
      );
      await this.dependencies.jobs.transitionJob(
        jobId,
        "validating",
        this.dependencies.now(),
      );
      const factIds = new Set([
        ...resumeFacts(record.resumeSnapshot).map(({ factId }) => factId),
        ...record.preferenceSnapshot.map(({ factId }) => factId),
      ]);
      const registry = { factIds, jdFieldIds: jdFieldIds(jd) };
      let quality = validateAiGreetingForJob(
        draft,
        registry,
        companyDisplayName,
        jd.jobTitle.text,
      );
      if (!quality.valid) {
        const firstDraft = draft;
        draft = await this.dependencies.generator.generate(
          record,
          {
            ...request,
            mode: "correction",
            previousDraft: firstDraft,
            qualityErrors: quality.errors,
          },
          signal,
        );
        quality = validateAiGreetingForJob(
          draft,
          registry,
          companyDisplayName,
          jd.jobTitle.text,
        );
      }
      if (!quality.valid) {
        throw new GreetingQualityFailure();
      }

      const timestamp = this.dependencies.now().toISOString();
      const warnings = Array.from(
        new Set([...(record.warnings ?? []), ...draft.warnings]),
      );
      const application: ApplicationRecord = {
        applicationId: `application_${jobId}`,
        jobId,
        userId: record.userId,
        resumeId: record.resumeId,
        status: "not_applied",
        greetingBody: draft.body,
        evidence: draft.claims,
        factSnapshot: referencedFactSnapshot(record, draft),
        jdSnapshot: sanitizeJobDescription(jd),
        omittedRequirements: [...draft.omittedRequirements],
        warnings,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.dependencies.applications.create(application);
      const final = await this.dependencies.jobs.finishSucceeded(
        jobId,
        {
          applicationId: application.applicationId,
          greeting: draft,
          warnings,
          omittedRequirements: draft.omittedRequirements,
        },
        this.dependencies.now(),
      );
      if (final.job.status !== "succeeded") {
        await this.dependencies.applications.deleteByJobId(jobId);
        if (final.job.quotaReservationId !== undefined) {
          await this.dependencies.quotas.release(
            final.job.quotaReservationId,
            this.dependencies.now(),
          );
        }
        await this.dependencies.generations.save({
          ...record,
          status: "failed",
          updatedAt: timestamp,
        });
        return true;
      }
      if (final.job.quotaReservationId !== undefined) {
        await this.dependencies.quotas.succeed(
          final.job.quotaReservationId,
          this.dependencies.now(),
        );
      }
      await this.dependencies.generations.save({
        ...record,
        status: "succeeded",
        updatedAt: timestamp,
      });
    } catch (error) {
      await this.fail(record, error);
    }
    return true;
  }

  private async fail(record: GenerationRecord, error: unknown): Promise<void> {
    const final = await this.dependencies.jobs.finishFailed(
      record.jobId,
      stableProcessingError(error),
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
    await this.dependencies.generations.save({
      ...record,
      status: final.job.status === "succeeded" ? "succeeded" : "failed",
      updatedAt: this.dependencies.now().toISOString(),
    });
  }
}
