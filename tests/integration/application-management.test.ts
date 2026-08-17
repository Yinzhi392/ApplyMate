import { describe, expect, it } from "vitest";

import {
  AgreementService,
  ApplicationService,
  InMemoryApplicationRepository,
  InMemoryIdentityRepository,
  UserService,
  createIdentityAccessApi,
  type ApplicationRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  AI_CONTENT_LABEL,
  countVisibleCharacters,
} from "../../shared/src/index.js";

const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const FIRST_TIME = new Date("2026-08-06T01:00:00.000Z");
const SECOND_TIME = new Date("2026-08-06T02:00:00.000Z");
const FACT_ID = "fact_1234567890abcdef12345678";

function validBody(): string {
  const first = "您好，我掌握SQL，能够认真理解岗位资料并清晰整理分析结果。";
  const second =
    "在具体执行中，我会先确认问题和数据口径，再完成清洗、分析与结果复核，并用结构化方式同步关键发现。这个过程让我习惯把模糊需求转化为可验证的任务，也能及时暴露风险并依据反馈调整方案。";
  let third =
    "我重视事实准确与沟通效率，愿意从基础工作做起，主动同步进展、认真吸收反馈，并将每次复盘转化为更稳定的交付。期待有机会进一步交流，也愿意承担细致的资料整理、需求跟进与团队协作工作。";
  while (countVisibleCharacters(`${first}\n${second}\n${third}`) < 360) {
    third += "我会保持可靠响应，并认真完成每项工作。";
  }
  return `${first}\n${second}\n${third}`;
}

function application(
  applicationId: string,
  jobId: string,
  userId: string,
  updatedAt: string,
  status: ApplicationRecord["status"] = "not_applied",
): ApplicationRecord {
  return {
    applicationId,
    jobId,
    userId,
    resumeId: `resume_${applicationId.slice(-8)}`,
    status,
    greetingBody: validBody(),
    evidence: [
      {
        claimId: `claim_${applicationId.slice(-8)}`,
        text: "我掌握SQL",
        sources: [{ type: "fact", factId: FACT_ID }],
      },
    ],
    factSnapshot: [{ factId: FACT_ID, sourceType: "skill", text: "掌握SQL" }],
    jdSnapshot: {
      jobTitle: {
        fieldId: `jd_title_${applicationId.slice(-8)}`,
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
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("application management", () => {
  it("isolates users, filters status, sorts by latest update, and deletes snapshots", async () => {
    const identities = new InMemoryIdentityRepository();
    const users = new UserService(identities);
    const userA = await users.getOrCreateUser("wx_application_a", FIRST_TIME);
    const userB = await users.getOrCreateUser("wx_application_b", FIRST_TIME);
    const agreements = new AgreementService(identities, VERSIONS);
    await agreements.acceptAgreements(userA, VERSIONS, FIRST_TIME);
    await agreements.acceptAgreements(userB, VERSIONS, FIRST_TIME);

    const repository = new InMemoryApplicationRepository();
    await repository.create(
      application(
        "application_owner_old",
        "job_application_owner_old",
        userA.userId,
        "2026-08-06T00:00:00.000Z",
      ),
    );
    await repository.create(
      application(
        "application_owner_new",
        "job_application_owner_new",
        userA.userId,
        "2026-08-06T00:30:00.000Z",
        "applied",
      ),
    );
    await repository.create(
      application(
        "application_other_user",
        "job_application_other_user",
        userB.userId,
        "2026-08-06T00:45:00.000Z",
      ),
    );
    const service = new ApplicationService(repository);
    let currentOpenId = "wx_application_a";
    let now = FIRST_TIME;
    const api = createIdentityAccessApi({
      repository: identities,
      applications: service,
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_application_a", "wx_application_b"],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: currentOpenId }),
    });

    await expect(
      api({ action: "application.list", payload: {} }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        applications: [
          { applicationId: "application_owner_new" },
          { applicationId: "application_owner_old" },
        ],
      },
    });
    await expect(
      api({
        action: "application.get",
        payload: { applicationId: "application_owner_new" },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        generationDisclosure: {
          availability: "unavailable",
          message: "生成信息不可用",
        },
      },
    });
    await expect(
      api({ action: "application.list", payload: { status: "applied" } }),
    ).resolves.toMatchObject({
      ok: true,
      data: { applications: [{ applicationId: "application_owner_new" }] },
    });
    await expect(
      api({
        action: "application.get",
        payload: { applicationId: "application_other_user" },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    now = SECOND_TIME;
    await expect(
      api({
        action: "application.update",
        payload: {
          applicationId: "application_owner_old",
          status: "applied",
          memo: "已在 Boss 直聘发送",
        },
        requestId: "70000001-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        application: {
          applicationId: "application_owner_old",
          status: "applied",
          memo: "已在 Boss 直聘发送",
          updatedAt: SECOND_TIME.toISOString(),
        },
      },
    });
    await expect(
      api({ action: "application.list", payload: {} }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        applications: [
          { applicationId: "application_owner_old" },
          { applicationId: "application_owner_new" },
        ],
      },
    });

    currentOpenId = "wx_application_b";
    await expect(
      api({
        action: "application.delete",
        payload: { applicationId: "application_owner_old" },
        requestId: "70000002-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    currentOpenId = "wx_application_a";
    await expect(
      api({
        action: "application.delete",
        payload: { applicationId: "application_owner_old" },
        requestId: "70000003-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { deletedApplicationId: "application_owner_old" },
    });
    await expect(
      api({
        action: "application.get",
        payload: { applicationId: "application_owner_old" },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await expect(repository.getById("application_owner_old")).resolves.toBeNull();
  });

  it("saves the latest manual text and returns non-blocking measurements and warnings", async () => {
    const identities = new InMemoryIdentityRepository();
    const user = await new UserService(identities).getOrCreateUser(
      "wx_application_editor",
      FIRST_TIME,
    );
    await new AgreementService(identities, VERSIONS).acceptAgreements(
      user,
      VERSIONS,
      FIRST_TIME,
    );
    const repository = new InMemoryApplicationRepository();
    await repository.create(
      application(
        "application_manual_edit",
        "job_application_manual_edit",
        user.userId,
        FIRST_TIME.toISOString(),
      ),
    );
    const api = createIdentityAccessApi({
      repository: identities,
      applications: new ApplicationService(repository),
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_application_editor"],
      now: () => SECOND_TIME,
      readCloudBaseContext: () => ({ OPENID: "wx_application_editor" }),
    });
    const editedBody = `${validBody()}我可以在2027年到岗。`;

    await expect(
      api({
        action: "application.update",
        payload: {
          applicationId: "application_manual_edit",
          greetingBody: editedBody,
        },
        requestId: "70000004-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        application: { greetingBody: editedBody },
        manualEvaluation: {
          canSave: true,
          canCopy: true,
          visibleCharacterCount: countVisibleCharacters(editedBody),
          paragraphCount: 3,
          warnings: expect.arrayContaining(["UNSOURCED_NUMBER"]),
        },
      },
    });
    await expect(
      api({
        action: "application.get",
        payload: { applicationId: "application_manual_edit" },
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        application: { greetingBody: editedBody },
        copyText: `${editedBody}\n${AI_CONTENT_LABEL}`,
      },
    });

    const cleared = await api({
      action: "application.update",
      payload: {
        applicationId: "application_manual_edit",
        greetingBody: validBody(),
        memo: "",
      },
      requestId: "70000005-1234-4234-a234-123456789abc",
    });
    expect(cleared).toMatchObject({
      ok: true,
      data: {
        application: { greetingBody: validBody() },
        manualEvaluation: { warnings: [] },
      },
    });
    expect(cleared).not.toHaveProperty("data.application.memo");
  });
});
