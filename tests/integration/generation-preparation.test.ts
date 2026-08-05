import { describe, expect, it, vi } from "vitest";

import {
  InMemoryGenerationRepository,
  InMemoryJobRepository,
  InMemoryTemporaryFileRepository,
  GenerationPreparationService,
  JobService,
  TemporaryFileService,
  type GenerationRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  JdParsePipeline,
  JdStructureParser,
} from "../../cloudfunctions/worker/src/index.js";
import {
  createFactId,
  hashFactText,
  type ResumeProfile,
} from "../../shared/src/index.js";

const NOW = new Date("2026-08-05T16:20:00.000Z");
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function resumeProfile(): ResumeProfile {
  const text = "熟悉 SQL";
  return {
    resumeId: "resume_prepare_01",
    education: [],
    experiences: [],
    projects: [],
    skills: [{
      factId: createFactId("skill", text),
      sourceType: "skill",
      text,
      factHash: hashFactText(text),
      name: "SQL",
    }],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: true,
  };
}

async function createHarness() {
  let fileIndex = 0;
  const temporaryFiles = new TemporaryFileService(
    new InMemoryTemporaryFileRepository(),
    () => `file_prepare_${++fileIndex}`,
  );
  const first = await temporaryFiles.createFile(
    "user_prepare",
    { originalName: "2.png", mimeType: "image/png", bytes: PNG },
    NOW,
  );
  const second = await temporaryFiles.createFile(
    "user_prepare",
    { originalName: "1.png", mimeType: "image/png", bytes: PNG },
    NOW,
  );
  const jobs = new JobService(
    new InMemoryJobRepository(),
    () => "job_prepare_01",
  );
  const job = await jobs.createJob("user_prepare", "greeting_generate", NOW);
  const generations = new InMemoryGenerationRepository();
  const record: GenerationRecord = {
    jobId: job.jobId,
    userId: "user_prepare",
    resumeId: "resume_prepare_01",
    inputType: "images",
    temporaryFileIds: [second.fileId, first.fileId],
    resumeSnapshot: resumeProfile(),
    preferenceSnapshot: [],
    status: "processing",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  await generations.create(record);
  return { temporaryFiles, first, second, jobs, generations, record };
}

describe("generation JD preparation", () => {
  it("OCRs in submitted order, masks text, deletes images, and waits without quota", async () => {
    const harness = await createHarness();
    const ocrOrder: string[] = [];
    const modelInputs: string[] = [];
    const pipeline = new JdParsePipeline({
      ocr: {
        recognize: async (_userId, fileId) => {
          ocrOrder.push(fileId);
          return {
            text: `${fileId} 岗位，电话 13800138000`,
            confidence: 0.99,
            providerRequestId: `ocr_${fileId}`,
            durationMs: 1,
            usageUnits: 1,
          };
        },
      },
      parser: new JdStructureParser({
        parseJobDescription: async (text) => {
          modelInputs.push(text);
          return {
            jobTitle: {
              fieldId: "jd_job_title",
              text: "产品实习生",
              confidence: 0.7,
            },
            responsibilities: [],
            hardSkills: [],
            experienceEducation: [],
            locationWorkMode: [],
            availabilityDuration: [],
          };
        },
      }),
    });
    const worker = new GenerationPreparationService(
      harness.jobs,
      harness.generations,
      harness.temporaryFiles,
      pipeline,
      () => NOW,
    );

    await expect(
      worker.run(harness.record.jobId, "worker_prepare", NOW),
    ).resolves.toMatchObject({ status: "awaiting_confirmation" });
    expect(ocrOrder).toEqual([harness.second.fileId, harness.first.fileId]);
    expect(modelInputs[0]).not.toContain("13800138000");
    await expect(
      harness.temporaryFiles.getOwnedFile("user_prepare", harness.first.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const waitingJob = await harness.jobs.getJobForUser(
      "user_prepare",
      harness.record.jobId,
    );
    expect(waitingJob).toMatchObject({
      status: "awaiting_user_confirmation",
      result: {
        pendingFieldIds: ["jd_job_title"],
        warnings: ["LOW_CONFIDENCE_FIELD", "COMPANY_NAME_MISSING"],
      },
    });
    expect(waitingJob).not.toHaveProperty("quotaReservationId");
  });

  it("deletes every JD image even when OCR fails and records a safe failure", async () => {
    const harness = await createHarness();
    const pipeline = {
      extract: vi.fn(async () => Promise.reject(new Error("provider secret"))),
      parse: vi.fn(),
    };
    const worker = new GenerationPreparationService(
      harness.jobs,
      harness.generations,
      harness.temporaryFiles,
      pipeline,
      () => NOW,
    );

    await expect(
      worker.run(harness.record.jobId, "worker_failed", NOW),
    ).resolves.toMatchObject({ status: "failed" });
    await expect(
      harness.temporaryFiles.getOwnedFile("user_prepare", harness.first.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      harness.jobs.getJobForUser("user_prepare", harness.record.jobId),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "JOB_FAILED", message: "JD processing failed." },
    });
  });
});
