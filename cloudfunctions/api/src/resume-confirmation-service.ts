import {
  ResumeProfileSchema,
  createFactId,
  hashFactText,
  type FactSourceType,
  type ResumeProfile,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type { JobService } from "./job-service.js";
import type { ResumeRepository } from "./resume-repository.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

export interface ConfirmedResumeResult {
  resumeId: string;
  profile: ResumeProfile;
  isDefault: boolean;
}

function rebuildFact<T extends { text: string }>(
  sourceType: FactSourceType,
  fact: T,
): T & {
  factId: string;
  sourceType: FactSourceType;
  factHash: string;
} {
  return {
    ...fact,
    factId: createFactId(sourceType, fact.text),
    sourceType,
    text: fact.text.trim(),
    factHash: hashFactText(fact.text),
  };
}

function rebuildProfile(profile: ResumeProfile): ResumeProfile {
  const rebuilt = ResumeProfileSchema.parse({
    ...profile,
    education: profile.education.map((fact) => rebuildFact("education", fact)),
    experiences: profile.experiences.map((fact) => rebuildFact("experience", fact)),
    projects: profile.projects.map((fact) => rebuildFact("project", fact)),
    skills: profile.skills.map((fact) => rebuildFact("skill", fact)),
    languages: profile.languages.map((fact) => rebuildFact("language", fact)),
    certificates: profile.certificates.map((fact) => rebuildFact("certificate", fact)),
    achievements: profile.achievements.map((fact) => rebuildFact("achievement", fact)),
    preferences: profile.preferences.map((fact) => rebuildFact("preference", fact)),
    otherFacts: profile.otherFacts.map((fact) => rebuildFact("other", fact)),
    confirmed: true,
  });
  const ids = [
    ...rebuilt.education,
    ...rebuilt.experiences,
    ...rebuilt.projects,
    ...rebuilt.skills,
    ...rebuilt.languages,
    ...rebuilt.certificates,
    ...rebuilt.achievements,
    ...rebuilt.preferences,
    ...rebuilt.otherFacts,
  ].map(({ factId }) => factId);
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("INVALID_REQUEST", "Resume contains duplicate facts.");
  }
  return rebuilt;
}

export class ResumeConfirmationService {
  constructor(
    private readonly resumes: ResumeRepository,
    private readonly temporaryFiles: TemporaryFileService,
    private readonly jobs: JobService,
  ) {}

  async confirm(
    userId: string,
    resumeId: string,
    submittedProfile: ResumeProfile,
    now: Date,
  ): Promise<ConfirmedResumeResult> {
    const record = await this.resumes.getById(resumeId);
    if (record === null || record.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Resume was not found.");
    }
    if (submittedProfile.resumeId !== resumeId) {
      throw new DomainError("INVALID_REQUEST", "Resume identifier does not match.");
    }
    const profile = rebuildProfile(submittedProfile);
    if (record.status === "confirmed") {
      if (
        record.profile !== undefined &&
        JSON.stringify(record.profile) === JSON.stringify(profile)
      ) {
        return { resumeId, profile: structuredClone(profile), isDefault: record.isDefault };
      }
      throw new DomainError("CONFLICT", "Confirmed resume cannot be changed here.");
    }
    if (record.status !== "awaiting_confirmation" || record.profile === undefined) {
      throw new DomainError("CONFLICT", "Resume is not ready for confirmation.");
    }

    const existing = await this.resumes.listByUser(userId);
    const isDefault = !existing.some(
      (candidate) => candidate.status === "confirmed" && candidate.isDefault,
    );
    for (const fileId of record.temporaryFileIds) {
      try {
        await this.temporaryFiles.deleteOwnedFile(userId, fileId);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "NOT_FOUND") {
          throw error;
        }
      }
    }

    const timestamp = now.toISOString();
    const confirmed = await this.resumes.saveIfStatus({
      ...record,
      temporaryFileIds: [],
      status: "confirmed",
      profile,
      isDefault,
      confirmedAt: timestamp,
      updatedAt: timestamp,
    }, "awaiting_confirmation");
    if (confirmed === null) {
      const raced = await this.resumes.getById(resumeId);
      if (
        raced?.status === "confirmed" &&
        raced.profile !== undefined &&
        JSON.stringify(raced.profile) === JSON.stringify(profile)
      ) {
        return {
          resumeId,
          profile: structuredClone(raced.profile),
          isDefault: raced.isDefault,
        };
      }
      throw new DomainError("CONFLICT", "Resume confirmation changed concurrently.");
    }
    await this.jobs.finishSucceeded(
      record.jobId,
      { resumeId, profile, isDefault },
      now,
    );
    return { resumeId, profile: structuredClone(profile), isDefault };
  }
}
