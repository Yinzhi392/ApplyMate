import { describe, expect, it } from "vitest";

import {
  AgreementService,
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  InMemoryTemporaryFileRepository,
  JobService,
  ResumeConfirmationService,
  TemporaryFileService,
  UserService,
  createIdentityAccessApi,
  type ResumeRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  createFactId,
  hashFactText,
  type ResumeProfile,
} from "../../shared/src/index.js";

const NOW = new Date("2026-08-05T14:00:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function draftProfile(resumeId: string): ResumeProfile {
  const text = "熟悉数据分析";
  return {
    resumeId,
    name: "陈同学",
    education: [],
    experiences: [],
    projects: [],
    skills: [
      {
        factId: createFactId("skill", text),
        sourceType: "skill",
        text,
        factHash: hashFactText(text),
        name: "数据分析",
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

describe("resume.confirm", () => {
  it("rebuilds evidence, deletes originals, completes once, and supports replay", async () => {
    const identities = new InMemoryIdentityRepository();
    const user = await new UserService(identities).getOrCreateUser(
      "wx_confirm_admin",
      NOW,
    );
    await new AgreementService(identities, VERSIONS).acceptAgreements(
      user,
      VERSIONS,
      NOW,
    );
    const temporaryFiles = new TemporaryFileService(
      new InMemoryTemporaryFileRepository(),
      () => "file_confirm",
    );
    await temporaryFiles.createFile(
      user.userId,
      {
        originalName: "resume.png",
        mimeType: "image/png",
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
      NOW,
    );
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_confirm",
    );
    const job = await jobs.createJob(user.userId, "resume_parse", NOW);
    await jobs.transitionJob(job.jobId, "ocr", NOW);
    await jobs.transitionJob(job.jobId, "parsing", NOW);
    await jobs.transitionJob(job.jobId, "awaiting_user_confirmation", NOW);
    const resumes = new InMemoryResumeRepository();
    const record: ResumeRecord = {
      resumeId: "resume_confirm_01",
      userId: user.userId,
      jobId: job.jobId,
      inputType: "images",
      temporaryFileIds: ["file_confirm"],
      status: "awaiting_confirmation",
      profile: draftProfile("resume_confirm_01"),
      isDefault: false,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    await resumes.createDraftIfBelowLimit(record, 3);
    const confirmations = new ResumeConfirmationService(
      resumes,
      temporaryFiles,
      jobs,
    );
    const api = createIdentityAccessApi({
      repository: identities,
      idempotency: new IdempotencyService(new InMemoryIdempotencyRepository()),
      jobs,
      confirmations,
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_confirm_admin"],
      now: () => NOW,
      readCloudBaseContext: () => ({ OPENID: "wx_confirm_admin" }),
    });
    const modifiedText = "熟悉数据分析，并完成三次合成项目复盘";
    const submitted = draftProfile(record.resumeId);
    submitted.skills[0] = {
      ...submitted.skills[0]!,
      text: modifiedText,
      factId: createFactId("skill", "旧内容"),
      factHash: hashFactText("旧内容"),
    };
    const [first, replay] = await Promise.all([
      api({
        action: "resume.confirm",
        payload: { resumeId: record.resumeId, profile: submitted },
        requestId: "50000011-1234-4234-a234-123456789abc",
      }),
      api({
        action: "resume.confirm",
        payload: { resumeId: record.resumeId, profile: submitted },
        requestId: "50000012-1234-4234-a234-123456789abc",
      }),
    ]);

    expect(first).toMatchObject({
      ok: true,
      data: { profile: { confirmed: true }, isDefault: true },
    });
    expect(replay).toEqual(first);
    const saved = await resumes.getById(record.resumeId);
    expect(saved).toMatchObject({
      status: "confirmed",
      temporaryFileIds: [],
      isDefault: true,
      profile: {
        confirmed: true,
        skills: [
          {
            factId: createFactId("skill", modifiedText),
            factHash: hashFactText(modifiedText),
          },
        ],
      },
    });
    await expect(
      temporaryFiles.getOwnedFile(user.userId, "file_confirm"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const completedJob = await jobs.getJobForUser(user.userId, job.jobId);
    expect(completedJob).toMatchObject({ status: "succeeded" });
    expect(
      completedJob.statusHistory.filter(({ status }) => status === "succeeded"),
    ).toHaveLength(1);
  });

  it("rejects invalid, mismatched, and cross-user confirmation without deletion", async () => {
    const resumes = new InMemoryResumeRepository();
    const temporaryFiles = new TemporaryFileService(
      new InMemoryTemporaryFileRepository(),
      () => "file_protected",
    );
    await temporaryFiles.createFile(
      "owner",
      {
        originalName: "resume.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("%PDF-1.7"),
      },
      NOW,
    );
    const jobs = new JobService(new InMemoryJobRepository(), () => "job_protected");
    await resumes.createDraftIfBelowLimit(
      {
        resumeId: "resume_protected_01",
        userId: "owner",
        jobId: "job_protected",
        inputType: "pdf",
        temporaryFileIds: ["file_protected"],
        status: "awaiting_confirmation",
        profile: draftProfile("resume_protected_01"),
        isDefault: false,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      3,
    );
    const service = new ResumeConfirmationService(resumes, temporaryFiles, jobs);

    await expect(
      service.confirm("other", "resume_protected_01", draftProfile("resume_protected_01"), NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.confirm("owner", "resume_protected_01", draftProfile("resume_different_01"), NOW),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      temporaryFiles.getOwnedFile("owner", "file_protected"),
    ).resolves.toMatchObject({ fileId: "file_protected" });
  });
});
