import { describe, expect, it } from "vitest";

import {
  AgreementService,
  GenerationWorkflowService,
  IdempotencyService,
  InMemoryGenerationRepository,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  InMemoryTemporaryFileRepository,
  JdInputValidationService,
  JobService,
  ResourceGateService,
  ResumeAccessService,
  ResumeFileValidationService,
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

const NOW = new Date("2026-08-05T16:10:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const OPEN_ID = "wx_phase_6_admin";

function requestId(index: number): string {
  return `6000000${index}-1234-4234-a234-123456789abc`;
}

function confirmedProfile(resumeId: string): ResumeProfile {
  const text = "使用 SQL 完成课程数据分析项目";
  return {
    resumeId,
    education: [],
    experiences: [],
    projects: [],
    skills: [
      {
        factId: createFactId("skill", text),
        sourceType: "skill",
        text,
        factHash: hashFactText(text),
        name: "SQL",
      },
    ],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: true,
  };
}

async function createHarness(resourceAvailable = true, dispatchFails = false) {
  const identities = new InMemoryIdentityRepository();
  const user = await new UserService(identities).getOrCreateUser(OPEN_ID, NOW);
  await new AgreementService(identities, VERSIONS).acceptAgreements(
    user,
    VERSIONS,
    NOW,
  );
  const jobs = new JobService(
    new InMemoryJobRepository(),
    (() => {
      let index = 0;
      return () => `job_generation_${++index}`;
    })(),
  );
  const resumes = new InMemoryResumeRepository();
  const resumeId = "resume_generation_01";
  const record: ResumeRecord = {
    resumeId,
    userId: user.userId,
    jobId: "job_existing_resume",
    inputType: "text",
    temporaryFileIds: [],
    status: "confirmed",
    profile: confirmedProfile(resumeId),
    isDefault: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    confirmedAt: NOW.toISOString(),
  };
  await resumes.createDraftIfBelowLimit(record, 3);
  const temporaryFiles = new TemporaryFileService(
    new InMemoryTemporaryFileRepository(),
  );
  const generations = new InMemoryGenerationRepository();
  const dispatched: string[] = [];
  const workflow = new GenerationWorkflowService({
    generations,
    resumeAccess: new ResumeAccessService(resumes),
    inputValidation: new JdInputValidationService(
      temporaryFiles,
      new ResumeFileValidationService(),
    ),
    jobs,
    dispatcher: {
      dispatch: (jobId) => {
        if (dispatchFails) {
          throw new Error("synthetic dispatch failure");
        }
        dispatched.push(jobId);
      },
    },
    temporaryFiles,
  });
  const api = createIdentityAccessApi({
    repository: identities,
    idempotency: new IdempotencyService(new InMemoryIdempotencyRepository()),
    jobs,
    generation: workflow,
    resourceGate: {
      service: new ResourceGateService({
        ocr: resourceAvailable,
        model: resourceAvailable,
        compute_storage: resourceAvailable,
      }),
      resolveRequirements: (action) =>
        action === "generation.create" ? ["model", "compute_storage"] : [],
    },
    currentVersions: VERSIONS,
    adminOpenIds: [OPEN_ID],
    now: () => NOW,
    readCloudBaseContext: () => ({ OPENID: OPEN_ID }),
  });
  return {
    api,
    generations,
    jobs,
    resumes,
    user,
    resumeId,
    dispatched,
    temporaryFiles,
  };
}

describe("generation.create API", () => {
  it("requires a current confirmed resume and immediately returns a queued job", async () => {
    const harness = await createHarness();
    const response = await harness.api({
      action: "generation.create",
      payload: {
        resumeId: harness.resumeId,
        inputType: "text",
        text: "产品实习生，要求 SQL 和用户研究。",
      },
      requestId: requestId(1),
    });

    expect(response).toMatchObject({
      ok: true,
      data: { jobId: "job_generation_1" },
    });
    expect(harness.dispatched).toEqual(["job_generation_1"]);
    await expect(
      harness.jobs.getJobForUser(harness.user.userId, "job_generation_1"),
    ).resolves.toMatchObject({ status: "queued", kind: "greeting_generate" });
  });

  it("rejects missing or deleted resumes before task creation", async () => {
    const harness = await createHarness();
    await harness.resumes.deleteById(harness.resumeId);

    await expect(
      harness.api({
        action: "generation.create",
        payload: {
          resumeId: harness.resumeId,
          inputType: "text",
          text: "合成岗位资料",
        },
        requestId: requestId(2),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(harness.dispatched).toEqual([]);
  });

  it("blocks paused free resources and coalesces duplicate request IDs", async () => {
    const paused = await createHarness(false);
    await expect(
      paused.api({
        action: "generation.create",
        payload: {
          resumeId: paused.resumeId,
          inputType: "text",
          text: "合成岗位资料",
        },
        requestId: requestId(3),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PAUSED" },
    });
    expect(paused.dispatched).toEqual([]);

    const active = await createHarness();
    const request = {
      action: "generation.create" as const,
      payload: {
        resumeId: active.resumeId,
        inputType: "text",
        text: "同一份合成岗位资料",
      },
      requestId: requestId(4),
    };
    const [first, duplicate] = await Promise.all([
      active.api(request),
      active.api(request),
    ]);
    expect(duplicate).toEqual(first);
    expect(active.dispatched).toEqual(["job_generation_1"]);
  });

  it("deletes JD images when initial asynchronous dispatch fails", async () => {
    const h = await createHarness(true, true);
    const file = await h.temporaryFiles.createFile(
      h.user.userId,
      {
        originalName: "jd.png",
        mimeType: "image/png",
        bytes: Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
      },
      NOW,
    );

    await expect(
      h.api({
        action: "generation.create",
        payload: {
          resumeId: h.resumeId,
          inputType: "images",
          fileIds: [file.fileId],
        },
        requestId: requestId(5),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "JOB_FAILED", retryable: true },
    });
    await expect(
      h.temporaryFiles.getOwnedFile(h.user.userId, file.fileId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
