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
  ResumeFileValidationService,
  ResumeTextValidationService,
  ResumeWorkflowService,
  TemporaryFileService,
  UserService,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const ADMIN_OPEN_ID = "wx_phase_5_admin";

function requestId(index: number): string {
  return `5000000${index}-1234-4234-a234-123456789abc`;
}

async function createHarness(openId = ADMIN_OPEN_ID) {
  const identities = new InMemoryIdentityRepository();
  const users = new UserService(identities);
  const user = await users.getOrCreateUser(openId, NOW);
  const temporaryFiles = new TemporaryFileService(
    new InMemoryTemporaryFileRepository(),
    (() => {
      let index = 0;
      return () => `file_resume_${++index}`;
    })(),
  );
  const jobs = new JobService(
    new InMemoryJobRepository(),
    (() => {
      let index = 0;
      return () => `job_resume_${++index}`;
    })(),
  );
  const resumes = new InMemoryResumeRepository();
  const dispatched: string[] = [];
  const workflow = new ResumeWorkflowService({
    resumes,
    temporaryFiles,
    fileValidation: new ResumeFileValidationService(),
    textValidation: new ResumeTextValidationService(),
    jobs,
    dispatcher: { dispatch: (jobId) => dispatched.push(jobId) },
    generateResumeId: (() => {
      let index = 0;
      return () => `resume_phase5_${++index}`;
    })(),
  });
  const api = createIdentityAccessApi({
    repository: identities,
    idempotency: new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    ),
    jobs,
    resumes: workflow,
    currentVersions: VERSIONS,
    adminOpenIds: [ADMIN_OPEN_ID],
    now: () => NOW,
    readCloudBaseContext: () => ({ OPENID: openId }),
  });
  return { api, identities, user, temporaryFiles, jobs, resumes, dispatched };
}

async function createInput(
  harness: Awaited<ReturnType<typeof createHarness>>,
  inputType: "text" | "pdf" | "docx" | "images",
): Promise<Record<string, unknown>> {
  if (inputType === "text") {
    return { inputType, text: "三年产品实习经历" };
  }

  const file = await harness.temporaryFiles.createFile(
    harness.user.userId,
    inputType === "pdf"
      ? {
          originalName: "resume.pdf",
          mimeType: "application/pdf",
          bytes: Buffer.from("%PDF-1.7\n"),
        }
      : inputType === "docx"
        ? {
            originalName: "resume.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
          }
        : {
            originalName: "resume.png",
            mimeType: "image/png",
            bytes: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]),
          },
    NOW,
  );
  return inputType === "images"
    ? { inputType, fileIds: [file.fileId] }
    : { inputType, fileId: file.fileId };
}

describe("resume.parse API", () => {
  it.each(["text", "pdf", "docx", "images"] as const)(
    "immediately creates and dispatches a queued job for %s input",
    async (inputType) => {
      const harness = await createHarness();
      await new AgreementService(harness.identities, VERSIONS).acceptAgreements(
        harness.user,
        VERSIONS,
        NOW,
      );
      const response = await harness.api({
        action: "resume.parse",
        payload: await createInput(harness, inputType),
        requestId: requestId(1),
      });

      expect(response).toMatchObject({
        ok: true,
        data: { jobId: "job_resume_1", resumeId: "resume_phase5_1" },
      });
      expect(harness.dispatched).toEqual(["job_resume_1"]);
      await expect(
        harness.jobs.getJobForUser(harness.user.userId, "job_resume_1"),
      ).resolves.toMatchObject({ status: "queued", kind: "resume_parse" });
    },
  );

  it("coalesces duplicate requestId without creating or dispatching twice", async () => {
    const harness = await createHarness();
    await new AgreementService(harness.identities, VERSIONS).acceptAgreements(
      harness.user,
      VERSIONS,
      NOW,
    );
    const request = {
      action: "resume.parse" as const,
      payload: { inputType: "text", text: "同一份合成简历" },
      requestId: requestId(2),
    };

    const [first, duplicate] = await Promise.all([
      harness.api(request),
      harness.api(request),
    ]);

    expect(duplicate).toEqual(first);
    expect(harness.dispatched).toEqual(["job_resume_1"]);
    await expect(harness.resumes.listByUser(harness.user.userId)).resolves.toHaveLength(1);
  });

  it("does not create a task before current agreements and activation", async () => {
    const unagreed = await createHarness();
    await expect(
      unagreed.api({
        action: "resume.parse",
        payload: { inputType: "text", text: "未同意协议" },
        requestId: requestId(3),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "AGREEMENT_REQUIRED" },
    });
    expect(unagreed.dispatched).toEqual([]);

    const pending = await createHarness("wx_phase_5_pending");
    await new AgreementService(pending.identities, VERSIONS).acceptAgreements(
      pending.user,
      VERSIONS,
      NOW,
    );
    await expect(
      pending.api({
        action: "resume.parse",
        payload: { inputType: "text", text: "没有邀请码" },
        requestId: requestId(4),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVITE_REQUIRED" },
    });
    expect(pending.dispatched).toEqual([]);
  });
});
