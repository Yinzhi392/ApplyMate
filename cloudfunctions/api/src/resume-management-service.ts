import { DomainError } from "./domain-error.js";
import type { JobService } from "./job-service.js";
import type { ResumeRecord } from "./resume-domain.js";
import type { ResumeRepository } from "./resume-repository.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

function publicResume(record: ResumeRecord) {
  return {
    resumeId: record.resumeId,
    jobId: record.jobId,
    inputType: record.inputType,
    status: record.status,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.confirmedAt === undefined ? {} : { confirmedAt: record.confirmedAt }),
    ...(record.profile === undefined ? {} : { profile: record.profile }),
  };
}

export class ResumeManagementService {
  constructor(
    private readonly resumes: ResumeRepository,
    private readonly temporaryFiles: TemporaryFileService,
    private readonly jobs?: JobService,
  ) {}

  async list(userId: string) {
    return (await this.resumes.listByUser(userId)).map(publicResume);
  }

  async setDefault(userId: string, resumeId: string, now: Date) {
    const existing = await this.resumes.getById(resumeId);
    if (existing === null || existing.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Resume was not found.");
    }
    if (existing.status !== "confirmed") {
      throw new DomainError("CONFLICT", "Only confirmed resumes can be default.");
    }
    const selected = await this.resumes.setDefaultForUser(userId, resumeId, now);
    if (selected === null) {
      throw new DomainError("CONFLICT", "Default resume could not be updated.");
    }
    return { resumeId: selected.resumeId, isDefault: selected.isDefault };
  }

  async delete(userId: string, resumeId: string, now: Date) {
    const existing = await this.resumes.getById(resumeId);
    if (existing === null || existing.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Resume was not found.");
    }
    for (const fileId of existing.temporaryFileIds) {
      try {
        await this.temporaryFiles.deleteOwnedFile(userId, fileId);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "NOT_FOUND") {
          throw error;
        }
      }
    }
    const result = await this.resumes.deleteForUserAndReselectDefault(
      userId,
      resumeId,
      now,
    );
    if (result === null) {
      throw new DomainError("NOT_FOUND", "Resume was not found.");
    }
    if (this.jobs !== undefined) {
      try {
        await this.jobs.finishFailed(
          existing.jobId,
          {
            code: "RESUME_DELETED",
            message: "Resume was deleted by the user.",
            retryable: false,
          },
          now,
        );
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "NOT_FOUND") {
          throw error;
        }
      }
    }
    return {
      deletedResumeId: result.deleted.resumeId,
      nextDefaultResumeId: result.nextDefault?.resumeId ?? null,
    };
  }
}
