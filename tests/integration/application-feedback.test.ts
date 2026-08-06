import { describe, expect, it } from "vitest";

import {
  AgreementService,
  ApplicationService,
  FeedbackService,
  InMemoryApplicationRepository,
  InMemoryFeedbackRepository,
  InMemoryIdentityRepository,
  UserService,
  createIdentityAccessApi,
  type ApplicationRecord,
} from "../../cloudfunctions/api/src/index.js";

const FIRST = new Date("2026-08-06T05:00:00.000Z");
const SECOND = new Date("2026-08-06T05:10:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function application(userId: string): ApplicationRecord {
  return {
    applicationId: "application_feedback_01",
    jobId: "job_feedback_01",
    userId,
    resumeId: "resume_feedback_01",
    status: "not_applied",
    greetingBody: "合成正文",
    evidence: [],
    factSnapshot: [],
    jdSnapshot: {
      jobTitle: {
        fieldId: "jd_feedback_title",
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
    createdAt: FIRST.toISOString(),
    updatedAt: FIRST.toISOString(),
  };
}

describe("application feedback", () => {
  it("keeps one overwriteable feedback record, enforces 500 characters, and isolates users", async () => {
    const identities = new InMemoryIdentityRepository();
    const users = new UserService(identities);
    const owner = await users.getOrCreateUser("wx_feedback_owner", FIRST);
    const other = await users.getOrCreateUser("wx_feedback_other", FIRST);
    const agreements = new AgreementService(identities, VERSIONS);
    await agreements.acceptAgreements(owner, VERSIONS, FIRST);
    await agreements.acceptAgreements(other, VERSIONS, FIRST);
    const applications = new InMemoryApplicationRepository();
    await applications.create(application(owner.userId));
    const feedback = new InMemoryFeedbackRepository();
    const applicationService = new ApplicationService(applications, feedback);
    const feedbackService = new FeedbackService(applicationService, feedback);
    let openId = "wx_feedback_owner";
    let now = FIRST;
    const api = createIdentityAccessApi({
      repository: identities,
      applications: applicationService,
      feedback: feedbackService,
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_feedback_owner", "wx_feedback_other"],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await expect(
      api({
        action: "feedback.submit",
        payload: {
          applicationId: "application_feedback_01",
          rating: "satisfied",
          note: "很贴合岗位",
        },
        requestId: "70000021-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        feedback: {
          applicationId: "application_feedback_01",
          rating: "satisfied",
          note: "很贴合岗位",
          createdAt: FIRST.toISOString(),
        },
      },
    });

    now = SECOND;
    await expect(
      api({
        action: "feedback.submit",
        payload: {
          applicationId: "application_feedback_01",
          rating: "needs_improvement",
          note: "字".repeat(500),
        },
        requestId: "70000022-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        feedback: {
          rating: "needs_improvement",
          note: "字".repeat(500),
          createdAt: FIRST.toISOString(),
          updatedAt: SECOND.toISOString(),
        },
      },
    });
    expect(await feedback.listByUser(owner.userId)).toHaveLength(1);

    await expect(
      api({
        action: "feedback.submit",
        payload: {
          applicationId: "application_feedback_01",
          rating: "satisfied",
          note: "字".repeat(501),
        },
        requestId: "70000023-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    await expect(
      feedback.getByApplicationId("application_feedback_01"),
    ).resolves.toMatchObject({ rating: "needs_improvement", note: "字".repeat(500) });

    openId = "wx_feedback_other";
    await expect(
      api({
        action: "feedback.submit",
        payload: {
          applicationId: "application_feedback_01",
          rating: "satisfied",
        },
        requestId: "70000024-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    openId = "wx_feedback_owner";
    await expect(
      api({
        action: "feedback.submit",
        payload: {
          applicationId: "application_feedback_01",
          rating: "satisfied",
          note: "",
        },
        requestId: "70000025-1234-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { feedback: { rating: "satisfied" } },
    });
    const detail = await api({
      action: "application.get",
      payload: { applicationId: "application_feedback_01" },
    });
    expect(detail).toMatchObject({
      ok: true,
      data: { feedback: { rating: "satisfied" } },
    });
    expect(detail).not.toHaveProperty("data.feedback.note");

    await api({
      action: "application.delete",
      payload: { applicationId: "application_feedback_01" },
      requestId: "70000026-1234-4234-a234-123456789abc",
    });
    await expect(
      feedback.getByApplicationId("application_feedback_01"),
    ).resolves.toBeNull();
  });
});
