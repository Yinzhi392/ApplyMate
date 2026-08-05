import { describe, expect, it } from "vitest";

import {
  AgreementService,
  GenerationConfirmationService,
  IdempotencyService,
  InMemoryGenerationRepository,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryQuotaRepository,
  JobService,
  QuotaService,
  UserService,
  createIdentityAccessApi,
  type GenerationRecord,
} from "../../cloudfunctions/api/src/index.js";
import type { ResumeProfile } from "../../shared/src/index.js";

const NOW = new Date("2026-08-05T16:30:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const OPEN_ID = "wx_confirm_admin";

const EMPTY_PROFILE: ResumeProfile = {
  resumeId: "resume_confirm_jd",
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

function confirmedJd() {
  return {
    jobTitle: {
      fieldId: "jd_job_title",
      text: "产品实习生",
      confidence: 1,
    },
    responsibilities: [],
    hardSkills: [],
    experienceEducation: [],
    locationWorkMode: [],
    availabilityDuration: [],
  };
}

async function harness() {
  const identities = new InMemoryIdentityRepository();
  const user = await new UserService(identities).getOrCreateUser(OPEN_ID, NOW);
  await new AgreementService(identities, VERSIONS).acceptAgreements(
    user,
    VERSIONS,
    NOW,
  );
  const jobs = new JobService(new InMemoryJobRepository(), () => "job_confirm_jd");
  const job = await jobs.createJob(user.userId, "greeting_generate", NOW);
  await jobs.transitionJob(job.jobId, "parsing", NOW);
  await jobs.transitionJob(job.jobId, "awaiting_user_confirmation", NOW, {
    clearClaim: true,
  });
  const generations = new InMemoryGenerationRepository();
  const record: GenerationRecord = {
    jobId: job.jobId,
    userId: user.userId,
    resumeId: EMPTY_PROFILE.resumeId,
    inputType: "text",
    temporaryFileIds: [],
    resumeSnapshot: EMPTY_PROFILE,
    preferenceSnapshot: [],
    status: "awaiting_confirmation",
    extractedMaskedText: "合成 JD",
    pendingFieldIds: ["jobTitle"],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  await generations.create(record);
  const quotaRepository = new InMemoryQuotaRepository();
  const quotas = new QuotaService(quotaRepository);
  const dispatched: string[] = [];
  const confirmations = new GenerationConfirmationService({
    generations,
    jobs,
    quotas,
    dispatcher: { dispatch: (jobId) => dispatched.push(jobId) },
  });
  const api = createIdentityAccessApi({
    repository: identities,
    idempotency: new IdempotencyService(new InMemoryIdempotencyRepository()),
    jobs,
    generationConfirmation: confirmations,
    currentVersions: VERSIONS,
    adminOpenIds: [OPEN_ID],
    now: () => NOW,
    readCloudBaseContext: () => ({ OPENID: OPEN_ID }),
  });
  return { api, user, jobs, generations, quotas, dispatched, jobId: job.jobId };
}

describe("generation.confirmJd", () => {
  it("continues the same job idempotently and reserves quota only now", async () => {
    const h = await harness();
    const request = {
      action: "generation.confirmJd" as const,
      payload: { jobId: h.jobId, jobDescription: confirmedJd() },
      requestId: "60000007-1234-4234-a234-123456789abc",
    };

    const [first, duplicate] = await Promise.all([
      h.api(request),
      h.api(request),
    ]);

    expect(first).toMatchObject({ ok: true, data: { jobId: h.jobId } });
    expect(duplicate).toEqual(first);
    expect(h.dispatched).toEqual([h.jobId]);
    await expect(h.jobs.getJobForUser(h.user.userId, h.jobId)).resolves.toMatchObject({
      status: "generating",
      quotaReservationId: `quota_${h.jobId}`,
    });
    await expect(h.quotas.getUsage(h.user.userId, NOW)).resolves.toMatchObject({
      reserved: 1,
      succeeded: 0,
    });
  });

  it("rejects another user, a non-waiting task, and a still-missing title", async () => {
    const h = await harness();
    const missingTitle = { ...confirmedJd(), jobTitle: undefined };
    await expect(
      h.api({
        action: "generation.confirmJd",
        payload: { jobId: h.jobId, jobDescription: missingTitle },
        requestId: "60000008-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(h.dispatched).toEqual([]);

    const foreignApi = createIdentityAccessApi({
      repository: new InMemoryIdentityRepository(),
      jobs: h.jobs,
      generationConfirmation: new GenerationConfirmationService({
        generations: h.generations,
        jobs: h.jobs,
        quotas: h.quotas,
        dispatcher: { dispatch: () => undefined },
      }),
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_foreign"],
      now: () => NOW,
      readCloudBaseContext: () => ({ OPENID: "wx_foreign" }),
    });
    await expect(
      foreignApi({
        action: "agreement.accept",
        payload: VERSIONS,
        requestId: "60000009-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      foreignApi({
        action: "generation.confirmJd",
        payload: { jobId: h.jobId, jobDescription: confirmedJd() },
        requestId: "60000010-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("releases quota and records a safe failure when continuation dispatch fails", async () => {
    const h = await harness();
    const failingConfirmation = new GenerationConfirmationService({
      generations: h.generations,
      jobs: h.jobs,
      quotas: h.quotas,
      dispatcher: { dispatch: () => { throw new Error("dispatch internals"); } },
    });

    await expect(
      failingConfirmation.confirm(
        h.user.userId,
        h.jobId,
        confirmedJd(),
        NOW,
      ),
    ).rejects.toMatchObject({ code: "JOB_FAILED", retryable: true });
    await expect(h.quotas.getUsage(h.user.userId, NOW)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 0,
    });
    await expect(h.jobs.getJobForUser(h.user.userId, h.jobId)).resolves.toMatchObject({
      status: "failed",
      error: { code: "JOB_DISPATCH_FAILED" },
    });
    await expect(h.generations.getByJobId(h.jobId)).resolves.toMatchObject({
      status: "failed",
    });
  });
});
