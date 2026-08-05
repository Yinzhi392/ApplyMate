import { describe, expect, it, vi } from "vitest";

import {
  AgreementService,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  JobService,
  ResumeAccessService,
  ResumeParseExecutionService,
  UserService,
  createIdentityAccessApi,
  type ResumeRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  createFactId,
  hashFactText,
  type ResumeProfile,
} from "../../shared/src/index.js";

const NOW = new Date("2026-08-05T13:00:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function profile(resumeId: string): ResumeProfile {
  const text = "熟悉用户研究和需求分析";
  return {
    resumeId,
    name: "周同学",
    education: [],
    experiences: [],
    projects: [],
    skills: [
      {
        factId: createFactId("skill", text),
        sourceType: "skill",
        text,
        factHash: hashFactText(text),
        name: "用户研究",
      },
    ],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: false,
  };
}

describe("resume parse worker", () => {
  it("publishes an editable profile through job.get and awaits confirmation", async () => {
    const identities = new InMemoryIdentityRepository();
    const user = await new UserService(identities).getOrCreateUser(
      "wx_worker_admin",
      NOW,
    );
    await new AgreementService(identities, VERSIONS).acceptAgreements(
      user,
      VERSIONS,
      NOW,
    );
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_worker_resume",
    );
    const job = await jobs.createJob(user.userId, "resume_parse", NOW);
    const resumes = new InMemoryResumeRepository();
    const draft: ResumeRecord = {
      resumeId: "resume_worker_01",
      userId: user.userId,
      jobId: job.jobId,
      inputType: "images",
      temporaryFileIds: ["image_1"],
      status: "processing",
      isDefault: false,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    await resumes.createDraftIfBelowLimit(draft, 3);
    const pipeline = {
      extract: vi.fn(async () => "OCR原始文本"),
      parseExtracted: vi.fn(async () => ({
        profile: profile(draft.resumeId),
        maskedTypes: ["phone" as const],
        maskedCount: 1,
      })),
    };
    const worker = new ResumeParseExecutionService(
      jobs,
      resumes,
      pipeline,
      () => NOW,
    );

    await expect(
      worker.run(job.jobId, "worker_phase_5", NOW),
    ).resolves.toBe(true);
    await expect(
      worker.run(job.jobId, "worker_duplicate", NOW),
    ).resolves.toBe(false);
    await expect(resumes.getById(draft.resumeId)).resolves.toMatchObject({
      status: "awaiting_confirmation",
      profile: { confirmed: false, name: "周同学" },
    });
    await expect(jobs.getJobForUser(user.userId, job.jobId)).resolves.toMatchObject({
      status: "awaiting_user_confirmation",
      statusHistory: [
        { status: "queued" },
        { status: "ocr" },
        { status: "parsing" },
        { status: "awaiting_user_confirmation" },
      ],
    });

    const api = createIdentityAccessApi({
      repository: identities,
      jobs,
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_worker_admin"],
      now: () => NOW,
      readCloudBaseContext: () => ({ OPENID: "wx_worker_admin" }),
    });
    await expect(
      api({ action: "job.get", payload: { jobId: job.jobId } }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "awaiting_user_confirmation",
        result: {
          resumeId: draft.resumeId,
          profile: { confirmed: false, name: "周同学" },
        },
      },
    });
  });

  it("records a stable failure without exposing model or OCR internals", async () => {
    const jobs = new JobService(new InMemoryJobRepository(), () => "job_failed");
    const job = await jobs.createJob("user_failed", "resume_parse", NOW);
    const resumes = new InMemoryResumeRepository();
    await resumes.createDraftIfBelowLimit(
      {
        resumeId: "resume_failed_01",
        userId: "user_failed",
        jobId: job.jobId,
        inputType: "text",
        temporaryFileIds: [],
        sourceText: "原始文本",
        status: "processing",
        isDefault: false,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      3,
    );
    const worker = new ResumeParseExecutionService(
      jobs,
      resumes,
      {
        extract: async () => Promise.reject(new Error("secret provider failure")),
        parseExtracted: async () => Promise.reject(new Error("unreachable")),
      },
      () => NOW,
    );

    await expect(worker.run(job.jobId, "worker_failed", NOW)).resolves.toBe(true);
    await expect(jobs.getJobForUser("user_failed", job.jobId)).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "JOB_FAILED",
        message: "Resume processing failed.",
        retryable: true,
      },
    });
    await expect(resumes.getByJobId(job.jobId)).resolves.toMatchObject({
      status: "failed",
    });
  });

  it("rejects an unconfirmed resume as generation evidence", async () => {
    const resumes = new InMemoryResumeRepository();
    await resumes.createDraftIfBelowLimit(
      {
        resumeId: "resume_guard_01",
        userId: "user_guard",
        jobId: "job_guard",
        inputType: "text",
        temporaryFileIds: [],
        sourceText: "尚未确认",
        status: "awaiting_confirmation",
        profile: profile("resume_guard_01"),
        isDefault: false,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      3,
    );
    const access = new ResumeAccessService(resumes);

    await expect(
      access.getConfirmedResumeForGeneration("user_guard", "resume_guard_01"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
