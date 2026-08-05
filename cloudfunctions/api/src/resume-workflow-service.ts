import type { JobDispatchPort } from "./job-dispatch-service.js";
import type { JobService } from "./job-service.js";
import { DomainError } from "./domain-error.js";
import type {
  CreatedResumeParseJob,
  ResumeParseInput,
  ResumeRecord,
} from "./resume-domain.js";
import type { ResumeFileValidationService } from "./resume-file-validation-service.js";
import type { ResumeRepository } from "./resume-repository.js";
import type { ResumeTextValidationService } from "./resume-text-validation-service.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

export const MAX_RESUMES_PER_USER = 3;

export interface ResumeWorkflowDependencies {
  resumes: ResumeRepository;
  temporaryFiles: TemporaryFileService;
  fileValidation: ResumeFileValidationService;
  textValidation: ResumeTextValidationService;
  jobs: JobService;
  dispatcher: JobDispatchPort;
  generateResumeId: () => string;
}

export class ResumeWorkflowService {
  constructor(private readonly dependencies: ResumeWorkflowDependencies) {}

  async createParseJob(
    userId: string,
    input: ResumeParseInput,
    now: Date,
  ): Promise<CreatedResumeParseJob> {
    const existing = await this.dependencies.resumes.listByUser(userId);
    if (existing.length >= MAX_RESUMES_PER_USER) {
      throw new DomainError("LIMIT_EXCEEDED", "A maximum of three resumes is allowed.");
    }

    let sourceText: string | undefined;
    let temporaryFileIds: string[] = [];
    if (input.inputType === "text") {
      sourceText = this.dependencies.textValidation.validate(input.text);
    } else {
      temporaryFileIds =
        input.inputType === "images" ? [...input.fileIds] : [input.fileId];
      const files = await Promise.all(
        temporaryFileIds.map((fileId) =>
          this.dependencies.temporaryFiles.getOwnedFile(userId, fileId),
        ),
      );
      this.dependencies.fileValidation.validate(input.inputType, files);
    }

    const job = await this.dependencies.jobs.createJob(
      userId,
      "resume_parse",
      now,
    );
    const timestamp = now.toISOString();
    const resume: ResumeRecord = {
      resumeId: this.dependencies.generateResumeId(),
      userId,
      jobId: job.jobId,
      inputType: input.inputType,
      temporaryFileIds,
      ...(sourceText === undefined ? {} : { sourceText }),
      status: "processing",
      isDefault: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const created = await this.dependencies.resumes.createDraftIfBelowLimit(
      resume,
      MAX_RESUMES_PER_USER,
    );
    if (!created) {
      await this.dependencies.jobs.finishFailed(
        job.jobId,
        {
          code: "RESUME_LIMIT_EXCEEDED",
          message: "A maximum of three resumes is allowed.",
          retryable: false,
        },
        now,
      );
      throw new DomainError("LIMIT_EXCEEDED", "A maximum of three resumes is allowed.");
    }

    try {
      this.dependencies.dispatcher.dispatch(job.jobId);
    } catch {
      await this.dependencies.jobs.finishFailed(
        job.jobId,
        {
          code: "JOB_DISPATCH_FAILED",
          message: "Resume processing could not be started.",
          retryable: true,
        },
        now,
      );
      await this.dependencies.resumes.save({
        ...resume,
        status: "failed",
        updatedAt: now.toISOString(),
      });
      throw new DomainError(
        "JOB_FAILED",
        "Resume processing could not be started.",
        true,
      );
    }
    return { resumeId: resume.resumeId, jobId: job.jobId };
  }
}
