import { describe, expect, it } from "vitest";

import {
  AccountDeletionService,
  IdempotencyService,
  InMemoryApplicationRepository,
  InMemoryFeedbackRepository,
  InMemoryGenerationRepository,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryOperationsRepository,
  InMemoryQuotaRepository,
  InMemoryResumeRepository,
  InMemoryRewriteRepository,
  InMemoryTemporaryFileRepository,
  ResumeManagementService,
  TemporaryFileService,
  UserService,
  type ApplicationRecord,
  type GenerationRecord,
  type JobRecord,
  type QuotaAdjustmentAuditRecord,
  type ResumeRecord,
  type RewriteRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  AccountDeletionCleanupService,
  InMemoryAnonymousAggregateRepository,
} from "../../cloudfunctions/cleanup/src/index.js";
import { type ResumeProfile } from "../../shared/src/index.js";

const START = new Date("2026-08-06T02:00:00.000Z");

function profile(): ResumeProfile {
  return {
    resumeId: "resume_delete_cleanup",
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
}

function job(userId: string): JobRecord {
  return {
    jobId: "job_delete_cleanup",
    userId,
    kind: "greeting_generate",
    status: "queued",
    statusHistory: [{ status: "queued", enteredAt: START.toISOString() }],
    createdAt: START.toISOString(),
    updatedAt: START.toISOString(),
  };
}

function application(userId: string): ApplicationRecord {
  return {
    applicationId: "application_delete_cleanup",
    jobId: "job_delete_cleanup",
    userId,
    resumeId: "resume_delete_cleanup",
    status: "not_applied",
    greetingBody: "合成投递正文",
    evidence: [],
    factSnapshot: [
      {
        factId: "fact_aaaaaaaaaaaaaaaaaaaaaaaa",
        sourceType: "skill",
        text: "合成历史事实",
      },
    ],
    jdSnapshot: {
      jobTitle: {
        fieldId: "jd_delete_title",
        text: "产品实习生",
        confidence: 1,
      },
      responsibilities: [],
      hardSkills: [],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
    },
    omittedRequirements: [],
    warnings: [],
    createdAt: START.toISOString(),
    updatedAt: START.toISOString(),
  };
}

describe("account deletion cleanup", () => {
  it("removes every user-linked record and snapshot while keeping only anonymous daily totals", async () => {
    const identities = new InMemoryIdentityRepository();
    const user = await new UserService(identities).getOrCreateUser(
      "wx_cleanup_owner",
      START,
    );
    const other = await new UserService(identities).getOrCreateUser(
      "wx_cleanup_other",
      START,
    );
    const resumes = new InMemoryResumeRepository();
    const resume: ResumeRecord = {
      resumeId: "resume_delete_cleanup",
      userId: user.userId,
      jobId: "job_resume_delete_cleanup",
      inputType: "text",
      temporaryFileIds: [],
      status: "confirmed",
      profile: profile(),
      isDefault: true,
      createdAt: START.toISOString(),
      updatedAt: START.toISOString(),
      confirmedAt: START.toISOString(),
    };
    await resumes.createDraftIfBelowLimit(resume, 3);
    const applications = new InMemoryApplicationRepository();
    await applications.create(application(user.userId));
    await new ResumeManagementService(
      resumes,
      new TemporaryFileService(new InMemoryTemporaryFileRepository()),
    ).delete(user.userId, resume.resumeId, START);
    await expect(applications.getById("application_delete_cleanup")).resolves.toMatchObject({
      factSnapshot: [{ text: "合成历史事实" }],
      jdSnapshot: { jobTitle: { text: "产品实习生" } },
    });
    await resumes.createDraftIfBelowLimit(resume, 3);

    const jobs = new InMemoryJobRepository();
    await jobs.createJob(job(user.userId));
    await jobs.createJob({
      ...job(other.userId),
      jobId: "job_delete_cleanup_other",
    });
    const generations = new InMemoryGenerationRepository();
    const generation: GenerationRecord = {
      jobId: "job_delete_cleanup",
      userId: user.userId,
      resumeId: resume.resumeId,
      inputType: "text",
      temporaryFileIds: [],
      sourceText: "合成岗位资料",
      resumeSnapshot: profile(),
      preferenceSnapshot: [],
      status: "processing",
      createdAt: START.toISOString(),
      updatedAt: START.toISOString(),
    };
    await generations.create(generation);
    const rewrites = new InMemoryRewriteRepository();
    const rewrite: RewriteRecord = {
      jobId: "job_rewrite_delete_cleanup",
      userId: user.userId,
      applicationId: "application_delete_cleanup",
      rewriteMode: "rephrase",
      sourceBody: "合成投递正文",
      sourceApplicationUpdatedAt: START.toISOString(),
      evidenceSnapshot: [],
      factSnapshot: application(user.userId).factSnapshot,
      jdSnapshot: application(user.userId).jdSnapshot,
      omittedRequirements: [],
      warnings: [],
      status: "processing",
      createdAt: START.toISOString(),
      updatedAt: START.toISOString(),
    };
    await rewrites.create(rewrite);
    const feedback = new InMemoryFeedbackRepository();
    await feedback.upsert({
      feedbackId: "feedback_delete_cleanup",
      applicationId: "application_delete_cleanup",
      userId: user.userId,
      rating: "satisfied",
      note: "合成反馈",
      createdAt: START.toISOString(),
      updatedAt: START.toISOString(),
    });
    const quotas = new InMemoryQuotaRepository();
    await quotas.reserve({
      reservationId: "reservation_delete_cleanup",
      userId: user.userId,
      dateKey: "2026-08-06",
      status: "reserved",
      createdAt: START.toISOString(),
      updatedAt: START.toISOString(),
    });
    const quotaAudit: QuotaAdjustmentAuditRecord = {
      auditId: "audit_quota_delete_cleanup",
      action: "admin.quotaAdjust",
      actorUserId: other.userId,
      targetUserId: user.userId,
      dateKey: "2026-08-06",
      increase: 1,
      reason: "synthetic deletion setup",
      createdAt: START.toISOString(),
    };
    await quotas.increaseTemporaryQuota(
      user.userId,
      "2026-08-06",
      1,
      quotaAudit,
      START,
    );
    const files = new InMemoryTemporaryFileRepository();
    await files.createFile({
      fileId: "file_delete_cleanup",
      ownerUserId: user.userId,
      storageKey: "temporary/delete-cleanup.png",
      originalName: "delete-cleanup.png",
      mimeType: "image/png",
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      sizeBytes: 4,
      uploadedAt: START.toISOString(),
    });
    const operations = new InMemoryOperationsRepository();
    await operations.recordResourceUsage({
      logId: "resource_delete_cleanup",
      userId: user.userId,
      resource: "ocr",
      operation: "resume.ocr",
      units: 1,
      unitName: "calls",
      estimatedCostYuan: 0,
      actualCostYuan: 0,
      durationMs: 10,
      status: "succeeded",
      contentHash: "c".repeat(64),
      createdAt: START.toISOString(),
    });
    await identities.setUserEnabledWithAudit(user.userId, false, {
      auditId: "audit_identity_delete_cleanup",
      action: "admin.userSetEnabled",
      actorUserId: other.userId,
      targetUserId: user.userId,
      enabled: false,
      reason: "synthetic deletion setup",
      createdAt: START.toISOString(),
    });
    const idempotencyRepository = new InMemoryIdempotencyRepository();
    const idempotency = new IdempotencyService(idempotencyRepository);
    await idempotency.execute(
      user.identityHash,
      "user.updatePreferences",
      "80000001-5678-4234-a234-123456789abc",
      { preferenceText: "合成偏好" },
      () => START,
      async () => ({ ok: true, data: { saved: true } }),
    );

    const deletion = new AccountDeletionService(
      identities,
      () => "synthetic-cleanup-delete-token",
    );
    const confirmation = await deletion.requestConfirmation(user, START);
    await deletion.confirm(
      user,
      confirmation.confirmationToken,
      new Date("2026-08-06T02:01:00.000Z"),
    );
    const aggregates = new InMemoryAnonymousAggregateRepository();
    const cleanup = new AccountDeletionCleanupService({
      identities,
      resumes,
      jobs,
      generations,
      rewrites,
      applications,
      feedback,
      quotas,
      files,
      operations,
      idempotency: idempotencyRepository,
      aggregates,
    });
    const result = await cleanup.run(new Date("2026-08-06T02:02:00.000Z"));

    expect(result).toEqual({ candidates: 1, deletedAccounts: 1 });
    await expect(identities.getUserById(user.userId)).resolves.toBeNull();
    await expect(
      identities.getUserByIdentityHash(user.identityHash),
    ).resolves.toBeNull();
    await expect(resumes.getById(resume.resumeId)).resolves.toBeNull();
    await expect(jobs.getJobById("job_delete_cleanup")).resolves.toBeNull();
    await expect(
      generations.getByJobId("job_delete_cleanup"),
    ).resolves.toBeNull();
    await expect(
      rewrites.getByJobId("job_rewrite_delete_cleanup"),
    ).resolves.toBeNull();
    await expect(
      applications.getById("application_delete_cleanup"),
    ).resolves.toBeNull();
    await expect(
      feedback.getByApplicationId("application_delete_cleanup"),
    ).resolves.toBeNull();
    await expect(quotas.getUsage(user.userId, "2026-08-06")).resolves.toBeNull();
    await expect(files.getFileById("file_delete_cleanup")).resolves.toBeNull();
    await expect(operations.listResourceUsage()).resolves.toEqual([]);
    await expect(jobs.getJobById("job_delete_cleanup_other")).resolves.toMatchObject({
      userId: other.userId,
    });

    let executedAgain = false;
    await idempotency.execute(
      user.identityHash,
      "user.updatePreferences",
      "80000001-5678-4234-a234-123456789abc",
      { preferenceText: "合成偏好" },
      () => new Date("2026-08-06T02:03:00.000Z"),
      async () => {
        executedAgain = true;
        return { ok: true, data: { saved: "new" } };
      },
    );
    expect(executedAgain).toBe(true);

    const aggregateRecords = await aggregates.list();
    expect(aggregateRecords).toEqual([
      { dateKey: "2026-08-06", metric: "accounts_deleted", count: 1 },
    ]);
    const serializedAggregates = JSON.stringify(aggregateRecords);
    for (const linkableValue of [
      user.userId,
      user.identityHash,
      "job_delete_cleanup",
      "2026-08-06T02:02:00.000Z",
    ]) {
      expect(serializedAggregates).not.toContain(linkableValue);
    }

    await expect(
      cleanup.run(new Date("2026-08-07T02:01:00.000Z")),
    ).resolves.toEqual({ candidates: 0, deletedAccounts: 0 });
    await expect(aggregates.list()).resolves.toEqual(aggregateRecords);
  });
});
