import { describe, expect, it } from "vitest";

import {
  InMemoryResumeRepository,
  InMemoryTemporaryFileRepository,
  TemporaryFileService,
  type ResumeRecord,
} from "../../cloudfunctions/api/src/index.js";
import { ResumeCleanupService } from "../../cloudfunctions/cleanup/src/index.js";

const NOW = new Date("2026-08-05T16:00:00.000Z");

function draft(
  resumeId: string,
  fileId: string,
  updatedAt: Date,
  status: ResumeRecord["status"] = "awaiting_confirmation",
): ResumeRecord {
  return {
    resumeId,
    userId: "user_cleanup",
    jobId: `job_${resumeId}`,
    inputType: "images",
    temporaryFileIds: [fileId],
    status,
    isDefault: status === "confirmed",
    createdAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    ...(status === "confirmed"
      ? {
          confirmedAt: updatedAt.toISOString(),
          profile: {
            resumeId,
            education: [],
            experiences: [],
            projects: [],
            skills: [],
            languages: [],
            certificates: [],
            achievements: [],
            preferences: [],
            otherFacts: [],
            confirmed: true as const,
          },
        }
      : {}),
  };
}

describe("resume cleanup", () => {
  it("deletes only 24-hour drafts and one-hour unreferenced files, idempotently", async () => {
    const repository = new InMemoryTemporaryFileRepository();
    let nextFileId = "";
    const temporaryFiles = new TemporaryFileService(
      repository,
      () => nextFileId,
    );
    async function addFile(fileId: string, uploadedAt: Date) {
      nextFileId = fileId;
      await temporaryFiles.createFile(
        "user_cleanup",
        {
          originalName: `${fileId}.png`,
          mimeType: "image/png",
          bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
        uploadedAt,
      );
    }
    const staleAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1_000);
    const freshAt = new Date(staleAt.getTime() + 1);
    const orphanAt = new Date(NOW.getTime() - 60 * 60 * 1_000);
    const newOrphanAt = new Date(orphanAt.getTime() + 1);
    await addFile("file_stale_draft", staleAt);
    await addFile("file_fresh_draft", freshAt);
    await addFile("file_confirmed_reference", staleAt);
    await addFile("file_old_orphan", orphanAt);
    await addFile("file_new_orphan", newOrphanAt);

    const resumes = new InMemoryResumeRepository();
    await resumes.createDraftIfBelowLimit(
      draft("resume_cleanup_stale", "file_stale_draft", staleAt),
      3,
    );
    await resumes.createDraftIfBelowLimit(
      draft("resume_cleanup_fresh", "file_fresh_draft", freshAt),
      3,
    );
    await resumes.createDraftIfBelowLimit(
      draft(
        "resume_cleanup_confirmed",
        "file_confirmed_reference",
        staleAt,
        "confirmed",
      ),
      3,
    );
    const expiredJobs: string[] = [];
    const cleanup = new ResumeCleanupService(
      resumes,
      temporaryFiles,
      {
        expireResumeJob: async (jobId) => {
          expiredJobs.push(jobId);
        },
      },
    );

    await expect(
      cleanup.run(new Date(NOW.getTime() - 1)),
    ).resolves.toEqual({ expiredDrafts: 0, deletedDraftFiles: 0, deletedOrphans: 0 });
    await expect(cleanup.run(NOW)).resolves.toEqual({
      expiredDrafts: 1,
      deletedDraftFiles: 1,
      deletedOrphans: 1,
    });
    await expect(cleanup.run(NOW)).resolves.toEqual({
      expiredDrafts: 0,
      deletedDraftFiles: 0,
      deletedOrphans: 0,
    });

    await expect(resumes.getById("resume_cleanup_stale")).resolves.toBeNull();
    await expect(resumes.getById("resume_cleanup_fresh")).resolves.not.toBeNull();
    await expect(
      temporaryFiles.getOwnedFile("user_cleanup", "file_stale_draft"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      temporaryFiles.getOwnedFile("user_cleanup", "file_old_orphan"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      temporaryFiles.getOwnedFile("user_cleanup", "file_fresh_draft"),
    ).resolves.toMatchObject({ fileId: "file_fresh_draft" });
    await expect(
      temporaryFiles.getOwnedFile("user_cleanup", "file_confirmed_reference"),
    ).resolves.toMatchObject({ fileId: "file_confirmed_reference" });
    await expect(
      temporaryFiles.getOwnedFile("user_cleanup", "file_new_orphan"),
    ).resolves.toMatchObject({ fileId: "file_new_orphan" });
    expect(expiredJobs).toEqual(["job_resume_cleanup_stale"]);
  });
});
