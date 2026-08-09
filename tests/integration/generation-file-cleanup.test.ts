import { describe, expect, it } from "vitest";

import {
  InMemoryGenerationRepository,
  type GenerationRecord,
} from "../../cloudfunctions/api/src/index.js";
import { GenerationFileCleanupService } from "../../cloudfunctions/cleanup/src/index.js";
import type { ResumeProfile } from "../../shared/src/index.js";

const PROFILE: ResumeProfile = {
  resumeId: "resume_cleanup_generation",
  education: [],
  experiences: [],
  projects: [],
  skills: [],
  languages: [],
  certificates: [],
  achievements: [],
  preferences: [],
  otherFacts: [],
  confirmed: true,
};

describe("generation image residual cleanup", () => {
  it("retries post-OCR files and clears only deleted references", async () => {
    const generations = new InMemoryGenerationRepository();
    const record: GenerationRecord = {
      jobId: "job_cleanup_generation",
      userId: "user_cleanup_generation",
      resumeId: PROFILE.resumeId,
      inputType: "images",
      temporaryFileIds: ["file_retry", "file_deleted"],
      resumeSnapshot: PROFILE,
      preferenceSnapshot: [],
      status: "generating",
      createdAt: "2026-08-05T10:00:00.000Z",
      updatedAt: "2026-08-05T10:01:00.000Z",
    };
    await generations.create(record);
    let firstAttempt = true;
    const deleted: string[] = [];
    const cleanup = new GenerationFileCleanupService(generations, {
      deleteOwnedFile: async (_userId, fileId) => {
        if (fileId === "file_retry" && firstAttempt) {
          firstAttempt = false;
          throw new Error("transient storage failure");
        }
        deleted.push(fileId);
        return true;
      },
    });

    await expect(cleanup.run()).resolves.toEqual({ candidates: 1, deleted: 1, remaining: 1 });
    await expect(generations.getByJobId(record.jobId)).resolves.toMatchObject({
      temporaryFileIds: ["file_retry"],
    });
    await expect(cleanup.run()).resolves.toEqual({ candidates: 1, deleted: 1, remaining: 0 });
    expect(deleted).toEqual(["file_deleted", "file_retry"]);
  });
});
