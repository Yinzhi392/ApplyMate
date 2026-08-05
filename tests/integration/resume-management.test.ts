import { describe, expect, it } from "vitest";

import {
  AgreementService,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  InMemoryTemporaryFileRepository,
  JobService,
  ResumeFileValidationService,
  ResumeManagementService,
  ResumeTextValidationService,
  ResumeWorkflowService,
  TemporaryFileService,
  UserService,
  createIdentityAccessApi,
  type ResumeRecord,
} from "../../cloudfunctions/api/src/index.js";
import type { ResumeProfile } from "../../shared/src/index.js";

const NOW = new Date("2026-08-05T15:00:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function confirmedProfile(resumeId: string): ResumeProfile {
  return {
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
    confirmed: true,
  };
}

function confirmedRecord(
  userId: string,
  resumeId: string,
  confirmedAt: string,
  isDefault = false,
): ResumeRecord {
  return {
    resumeId,
    userId,
    jobId: `job_${resumeId}`,
    inputType: "text",
    temporaryFileIds: [],
    status: "confirmed",
    profile: confirmedProfile(resumeId),
    isDefault,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
    confirmedAt,
  };
}

describe("resume management", () => {
  it("lists only the owner, changes default, and deterministically reselects on delete", async () => {
    const identities = new InMemoryIdentityRepository();
    const users = new UserService(identities);
    const userA = await users.getOrCreateUser("wx_resume_a", NOW);
    const userB = await users.getOrCreateUser("wx_resume_b", NOW);
    const agreements = new AgreementService(identities, VERSIONS);
    await agreements.acceptAgreements(userA, VERSIONS, NOW);
    await agreements.acceptAgreements(userB, VERSIONS, NOW);
    const resumes = new InMemoryResumeRepository();
    await resumes.createDraftIfBelowLimit(
      confirmedRecord(userA.userId, "resume_manage_01", "2026-08-01T00:00:00.000Z", true),
      3,
    );
    await resumes.createDraftIfBelowLimit(
      confirmedRecord(userA.userId, "resume_manage_02", "2026-08-02T00:00:00.000Z"),
      3,
    );
    await resumes.createDraftIfBelowLimit(
      confirmedRecord(userA.userId, "resume_manage_03", "2026-08-03T00:00:00.000Z"),
      3,
    );
    const management = new ResumeManagementService(
      resumes,
      new TemporaryFileService(new InMemoryTemporaryFileRepository()),
    );
    let openId = "wx_resume_a";
    const api = createIdentityAccessApi({
      repository: identities,
      management,
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_resume_a", "wx_resume_b"],
      now: () => NOW,
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await expect(
      api({ action: "resume.list", payload: {} }),
    ).resolves.toMatchObject({
      ok: true,
      data: { resumes: [{ resumeId: "resume_manage_01" }, {}, {}] },
    });
    await expect(
      api({
        action: "resume.setDefault",
        payload: { resumeId: "resume_manage_02" },
        requestId: "50000021-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { resumeId: "resume_manage_02", isDefault: true },
    });

    openId = "wx_resume_b";
    await expect(
      api({
        action: "resume.delete",
        payload: { resumeId: "resume_manage_02" },
        requestId: "50000022-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await expect(
      api({ action: "resume.list", payload: {} }),
    ).resolves.toMatchObject({ ok: true, data: { resumes: [] } });

    openId = "wx_resume_a";
    await expect(
      api({
        action: "resume.delete",
        payload: { resumeId: "resume_manage_02" },
        requestId: "50000023-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        deletedResumeId: "resume_manage_02",
        nextDefaultResumeId: "resume_manage_03",
      },
    });
    const remaining = await resumes.listByUser(userA.userId);
    expect(remaining.filter(({ isDefault }) => isDefault)).toMatchObject([
      { resumeId: "resume_manage_03" },
    ]);
  });

  it("blocks creation of a fourth resume without dispatching it", async () => {
    const resumes = new InMemoryResumeRepository();
    const jobs = new JobService(
      new InMemoryJobRepository(),
      (() => {
        let index = 0;
        return () => `job_limit_${++index}`;
      })(),
    );
    const dispatched: string[] = [];
    const workflow = new ResumeWorkflowService({
      resumes,
      temporaryFiles: new TemporaryFileService(
        new InMemoryTemporaryFileRepository(),
      ),
      fileValidation: new ResumeFileValidationService(),
      textValidation: new ResumeTextValidationService(),
      jobs,
      dispatcher: { dispatch: (jobId) => dispatched.push(jobId) },
      generateResumeId: (() => {
        let index = 0;
        return () => `resume_limit_${++index}`;
      })(),
    });

    for (let index = 0; index < 3; index += 1) {
      await workflow.createParseJob(
        "user_limit",
        { inputType: "text", text: `简历 ${index}` },
        NOW,
      );
    }
    await expect(
      workflow.createParseJob(
        "user_limit",
        { inputType: "text", text: "第四份" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(dispatched).toEqual(["job_limit_1", "job_limit_2", "job_limit_3"]);
  });
});
