import type { ResumeRecord } from "./resume-domain.js";

export interface ResumeRepository {
  createDraftIfBelowLimit(
    resume: ResumeRecord,
    maximumResumes: number,
  ): Promise<boolean>;
  getById(resumeId: string): Promise<ResumeRecord | null>;
  getByJobId(jobId: string): Promise<ResumeRecord | null>;
  save(resume: ResumeRecord): Promise<void>;
  saveIfStatus(
    resume: ResumeRecord,
    expectedStatus: ResumeRecord["status"],
  ): Promise<ResumeRecord | null>;
  listByUser(userId: string): Promise<ResumeRecord[]>;
  listAllForMetrics(): Promise<ResumeRecord[]>;
  deleteById(resumeId: string): Promise<boolean>;
  setDefaultForUser(
    userId: string,
    resumeId: string,
    now: Date,
  ): Promise<ResumeRecord | null>;
  deleteForUserAndReselectDefault(
    userId: string,
    resumeId: string,
    now: Date,
  ): Promise<{ deleted: ResumeRecord; nextDefault: ResumeRecord | null } | null>;
  listUnconfirmedUpdatedAtOrBefore(cutoff: Date): Promise<ResumeRecord[]>;
  listReferencedTemporaryFileIds(): Promise<Set<string>>;
  deleteByUserId(userId: string): Promise<number>;
}

function cloneResume(resume: ResumeRecord): ResumeRecord {
  return structuredClone(resume);
}

export class InMemoryResumeRepository implements ResumeRepository {
  readonly #resumes = new Map<string, ResumeRecord>();

  async createDraftIfBelowLimit(
    resume: ResumeRecord,
    maximumResumes: number,
  ): Promise<boolean> {
    if (this.#resumes.has(resume.resumeId)) {
      throw new Error("Resume identifier must be unique.");
    }
    const currentCount = Array.from(this.#resumes.values()).filter(
      ({ userId }) => userId === resume.userId,
    ).length;
    if (currentCount >= maximumResumes) {
      return false;
    }
    this.#resumes.set(resume.resumeId, cloneResume(resume));
    return true;
  }

  async getById(resumeId: string): Promise<ResumeRecord | null> {
    const resume = this.#resumes.get(resumeId);
    return resume === undefined ? null : cloneResume(resume);
  }

  async getByJobId(jobId: string): Promise<ResumeRecord | null> {
    const resume = Array.from(this.#resumes.values()).find(
      (candidate) => candidate.jobId === jobId,
    );
    return resume === undefined ? null : cloneResume(resume);
  }

  async save(resume: ResumeRecord): Promise<void> {
    if (!this.#resumes.has(resume.resumeId)) {
      throw new Error("Cannot save an unknown resume.");
    }
    this.#resumes.set(resume.resumeId, cloneResume(resume));
  }

  async saveIfStatus(
    resume: ResumeRecord,
    expectedStatus: ResumeRecord["status"],
  ): Promise<ResumeRecord | null> {
    const current = this.#resumes.get(resume.resumeId);
    if (current === undefined || current.status !== expectedStatus) {
      return null;
    }
    this.#resumes.set(resume.resumeId, cloneResume(resume));
    return cloneResume(resume);
  }

  async listByUser(userId: string): Promise<ResumeRecord[]> {
    return Array.from(this.#resumes.values())
      .filter((resume) => resume.userId === userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneResume);
  }

  async listAllForMetrics(): Promise<ResumeRecord[]> {
    return Array.from(this.#resumes.values(), cloneResume);
  }

  async deleteById(resumeId: string): Promise<boolean> {
    return this.#resumes.delete(resumeId);
  }

  async setDefaultForUser(
    userId: string,
    resumeId: string,
    now: Date,
  ): Promise<ResumeRecord | null> {
    const selected = this.#resumes.get(resumeId);
    if (
      selected === undefined ||
      selected.userId !== userId ||
      selected.status !== "confirmed"
    ) {
      return null;
    }
    const timestamp = now.toISOString();
    for (const [id, resume] of this.#resumes) {
      if (resume.userId === userId && resume.status === "confirmed") {
        this.#resumes.set(id, {
          ...resume,
          isDefault: id === resumeId,
          updatedAt: timestamp,
        });
      }
    }
    return cloneResume(this.#resumes.get(resumeId)!);
  }

  async deleteForUserAndReselectDefault(
    userId: string,
    resumeId: string,
    now: Date,
  ): Promise<{ deleted: ResumeRecord; nextDefault: ResumeRecord | null } | null> {
    const deleted = this.#resumes.get(resumeId);
    if (deleted === undefined || deleted.userId !== userId) {
      return null;
    }
    this.#resumes.delete(resumeId);
    let nextDefault = Array.from(this.#resumes.values()).find(
      (resume) =>
        resume.userId === userId &&
        resume.status === "confirmed" &&
        resume.isDefault,
    );
    if (deleted.isDefault) {
      const candidates = Array.from(this.#resumes.values())
        .filter(
          (resume) => resume.userId === userId && resume.status === "confirmed",
        )
        .sort((left, right) => {
          const byConfirmed = (right.confirmedAt ?? right.createdAt).localeCompare(
            left.confirmedAt ?? left.createdAt,
          );
          return byConfirmed === 0
            ? right.resumeId.localeCompare(left.resumeId)
            : byConfirmed;
        });
      nextDefault = candidates[0];
      if (nextDefault !== undefined) {
        const updated = {
          ...nextDefault,
          isDefault: true,
          updatedAt: now.toISOString(),
        };
        this.#resumes.set(updated.resumeId, updated);
        nextDefault = updated;
      }
    }
    return {
      deleted: cloneResume(deleted),
      nextDefault: nextDefault === undefined ? null : cloneResume(nextDefault),
    };
  }

  async listUnconfirmedUpdatedAtOrBefore(cutoff: Date): Promise<ResumeRecord[]> {
    return Array.from(this.#resumes.values())
      .filter(
        (resume) =>
          resume.status !== "confirmed" &&
          new Date(resume.updatedAt).getTime() <= cutoff.getTime(),
      )
      .map(cloneResume);
  }

  async listReferencedTemporaryFileIds(): Promise<Set<string>> {
    return new Set(
      Array.from(this.#resumes.values()).flatMap(
        ({ temporaryFileIds }) => temporaryFileIds,
      ),
    );
  }

  async deleteByUserId(userId: string): Promise<number> {
    let deleted = 0;
    for (const [resumeId, resume] of this.#resumes) {
      if (resume.userId === userId && this.#resumes.delete(resumeId)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}
