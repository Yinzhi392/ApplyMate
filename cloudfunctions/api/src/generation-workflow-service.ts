import type { PreferenceFact } from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type {
  GenerationCreateInput,
  GenerationRecord,
} from "./generation-domain.js";
import type { GenerationRepository } from "./generation-repository.js";
import type { JdInputValidationService } from "./jd-input-validation-service.js";
import type { JobDispatchPort } from "./job-dispatch-service.js";
import type { JobService } from "./job-service.js";
import type { ResumeAccessService } from "./resume-access-service.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

export interface GenerationWorkflowDependencies {
  generations: GenerationRepository;
  resumeAccess: ResumeAccessService;
  inputValidation: JdInputValidationService;
  jobs: JobService;
  dispatcher: JobDispatchPort;
  temporaryFiles: TemporaryFileService;
}

export class GenerationWorkflowService {
  constructor(private readonly dependencies: GenerationWorkflowDependencies) {}

  async createJob(
    userId: string,
    preferenceFacts: PreferenceFact[],
    input: GenerationCreateInput,
    now: Date,
  ): Promise<{ jobId: string }> {
    const resumeSnapshot =
      await this.dependencies.resumeAccess.getConfirmedResumeForGeneration(
        userId,
        input.resumeId,
      );
    const validated = await this.dependencies.inputValidation.validate(userId, input);
    const job = await this.dependencies.jobs.createJob(
      userId,
      "greeting_generate",
      now,
    );
    const timestamp = now.toISOString();
    const record: GenerationRecord = {
      jobId: job.jobId,
      userId,
      resumeId: input.resumeId,
      inputType: validated.inputType,
      temporaryFileIds:
        validated.inputType === "images" ? [...validated.fileIds] : [],
      ...(validated.inputType === "text"
        ? { sourceText: validated.sourceText }
        : {}),
      resumeSnapshot,
      preferenceSnapshot: structuredClone(preferenceFacts),
      status: "processing",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.dependencies.generations.create(record);

    try {
      this.dependencies.dispatcher.dispatch(job.jobId);
    } catch {
      await this.dependencies.jobs.finishFailed(
        job.jobId,
        {
          code: "JOB_DISPATCH_FAILED",
          message: "Greeting generation could not be started.",
          retryable: true,
        },
        now,
      );
      const failedRecord: GenerationRecord = {
        ...record,
        status: "failed",
        updatedAt: timestamp,
      };
      delete failedRecord.sourceText;
      await this.dependencies.generations.save(failedRecord);
      await Promise.allSettled(
        record.temporaryFileIds.map((fileId) =>
          this.dependencies.temporaryFiles.deleteOwnedFile(userId, fileId),
        ),
      );
      throw new DomainError(
        "JOB_FAILED",
        "Greeting generation could not be started.",
        true,
      );
    }
    return { jobId: job.jobId };
  }
}
