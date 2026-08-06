import {
  MAX_FEEDBACK_VISIBLE_CHARACTERS,
  countVisibleCharacters,
  hasValidUnicode,
} from "../../../shared/src/index.js";

import type { ApplicationService } from "./application-service.js";
import { DomainError } from "./domain-error.js";
import type {
  GenerationRewriteInput,
  RewriteRecord,
} from "./generation-rewrite-domain.js";
import type { RewriteRepository } from "./generation-rewrite-repository.js";
import type { JobDispatchPort } from "./job-dispatch-service.js";
import type { JobService } from "./job-service.js";

export interface GenerationRewriteWorkflowDependencies {
  applications: ApplicationService;
  jobs: JobService;
  rewrites: RewriteRepository;
  dispatcher: JobDispatchPort;
}

function normalizedInstruction(input: GenerationRewriteInput): string | undefined {
  if (input.mode !== "custom") {
    return undefined;
  }
  const instruction = input.instruction?.trim() ?? "";
  if (
    instruction === "" ||
    !hasValidUnicode(instruction) ||
    countVisibleCharacters(instruction) > MAX_FEEDBACK_VISIBLE_CHARACTERS
  ) {
    throw new DomainError("INVALID_REQUEST", "Rewrite instruction is invalid.");
  }
  return instruction;
}

export class GenerationRewriteWorkflowService {
  constructor(
    private readonly dependencies: GenerationRewriteWorkflowDependencies,
  ) {}

  async createJob(
    userId: string,
    input: GenerationRewriteInput,
    now: Date,
  ): Promise<{ jobId: string }> {
    const { application } = await this.dependencies.applications.get(
      userId,
      input.applicationId,
    );
    const customInstruction = normalizedInstruction(input);
    const job = await this.dependencies.jobs.createJob(
      userId,
      "greeting_rewrite",
      now,
    );
    const timestamp = now.toISOString();
    const record: RewriteRecord = {
      jobId: job.jobId,
      userId,
      applicationId: application.applicationId,
      rewriteMode: input.mode,
      ...(customInstruction === undefined ? {} : { customInstruction }),
      sourceBody: application.greetingBody,
      sourceApplicationUpdatedAt: application.updatedAt,
      evidenceSnapshot: structuredClone(application.evidence),
      factSnapshot: structuredClone(application.factSnapshot),
      jdSnapshot: structuredClone(application.jdSnapshot),
      omittedRequirements: [...application.omittedRequirements],
      warnings: [...application.warnings],
      status: "processing",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.dependencies.rewrites.create(record);
    try {
      this.dependencies.dispatcher.dispatch(job.jobId);
    } catch {
      await this.dependencies.jobs.finishFailed(
        job.jobId,
        {
          code: "JOB_DISPATCH_FAILED",
          message: "Greeting rewrite could not be started.",
          retryable: true,
        },
        now,
      );
      await this.dependencies.rewrites.save({
        ...record,
        status: "failed",
        updatedAt: timestamp,
      });
      throw new DomainError(
        "JOB_FAILED",
        "Greeting rewrite could not be started.",
        true,
      );
    }
    return { jobId: job.jobId };
  }
}
