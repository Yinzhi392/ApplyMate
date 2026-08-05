export const UNCONFIRMED_RESUME_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const ORPHAN_RESUME_FILE_RETENTION_MS = 60 * 60 * 1_000;

interface CleanupResumeRecord {
  resumeId: string;
  userId: string;
  jobId: string;
  temporaryFileIds: string[];
}

interface CleanupTemporaryFileRecord {
  fileId: string;
  ownerUserId: string;
}

export interface ResumeCleanupRepositoryPort {
  listUnconfirmedUpdatedAtOrBefore(cutoff: Date): Promise<CleanupResumeRecord[]>;
  deleteById(resumeId: string): Promise<boolean>;
  listReferencedTemporaryFileIds(): Promise<Set<string>>;
}

export interface ResumeCleanupFilePort {
  deleteOwnedFile(ownerUserId: string, fileId: string): Promise<boolean>;
  listUploadedAtOrBefore(cutoff: Date): Promise<CleanupTemporaryFileRecord[]>;
}

export interface ResumeCleanupJobPort {
  expireResumeJob(jobId: string, now: Date): Promise<void>;
}

export interface ResumeCleanupResult {
  expiredDrafts: number;
  deletedDraftFiles: number;
  deletedOrphans: number;
}

function isNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    Reflect.get(error, "code") === "NOT_FOUND"
  );
}

export class ResumeCleanupService {
  constructor(
    private readonly resumes: ResumeCleanupRepositoryPort,
    private readonly files: ResumeCleanupFilePort,
    private readonly jobs?: ResumeCleanupJobPort,
  ) {}

  async run(now: Date): Promise<ResumeCleanupResult> {
    const draftCutoff = new Date(
      now.getTime() - UNCONFIRMED_RESUME_RETENTION_MS,
    );
    const drafts = await this.resumes.listUnconfirmedUpdatedAtOrBefore(
      draftCutoff,
    );
    let expiredDrafts = 0;
    let deletedDraftFiles = 0;
    for (const draft of drafts) {
      for (const fileId of draft.temporaryFileIds) {
        try {
          if (await this.files.deleteOwnedFile(draft.userId, fileId)) {
            deletedDraftFiles += 1;
          }
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      }
      if (await this.resumes.deleteById(draft.resumeId)) {
        expiredDrafts += 1;
        await this.jobs?.expireResumeJob(draft.jobId, now);
      }
    }

    const referenced = await this.resumes.listReferencedTemporaryFileIds();
    const orphanCutoff = new Date(
      now.getTime() - ORPHAN_RESUME_FILE_RETENTION_MS,
    );
    const oldFiles = await this.files.listUploadedAtOrBefore(orphanCutoff);
    let deletedOrphans = 0;
    for (const file of oldFiles) {
      if (referenced.has(file.fileId)) {
        continue;
      }
      try {
        if (await this.files.deleteOwnedFile(file.ownerUserId, file.fileId)) {
          deletedOrphans += 1;
        }
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    }
    return { expiredDrafts, deletedDraftFiles, deletedOrphans };
  }
}
