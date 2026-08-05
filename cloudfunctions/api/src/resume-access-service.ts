import type { ResumeProfile } from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type { ResumeRepository } from "./resume-repository.js";

export class ResumeAccessService {
  constructor(private readonly resumes: ResumeRepository) {}

  async getConfirmedResumeForGeneration(
    userId: string,
    resumeId: string,
  ): Promise<ResumeProfile> {
    const resume = await this.resumes.getById(resumeId);
    if (resume === null || resume.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Resume was not found.");
    }
    if (
      resume.status !== "confirmed" ||
      resume.profile === undefined ||
      !resume.profile.confirmed
    ) {
      throw new DomainError(
        "CONFLICT",
        "Resume must be confirmed before generation.",
      );
    }
    return structuredClone(resume.profile);
  }
}
