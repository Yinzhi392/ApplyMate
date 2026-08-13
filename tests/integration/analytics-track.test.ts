import { describe, expect, it } from "vitest";

import {
  AnalyticsService,
  IdempotencyService,
  InMemoryApplicationRepository,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  UserService,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const VERSIONS = {
  userAgreementVersion: "user-2026-08-09",
  privacyPolicyVersion: "privacy-2026-08-09",
};

describe("analytics.track", () => {
  it("requires a request id, records only minimal participation data, and verifies copy ownership", async () => {
    const identities = new InMemoryIdentityRepository();
    const jobs = new InMemoryJobRepository();
    const applications = new InMemoryApplicationRepository();
    const user = await new UserService(identities).getOrCreateUser(
      "wx_analytics_user",
      new Date("2026-08-01T02:00:00.000Z"),
    );
    await identities.saveUser({
      ...user,
      activationStatus: "active",
      activatedAt: "2026-08-01T02:00:00.000Z",
      agreements: {
        userAgreement: { version: VERSIONS.userAgreementVersion, acceptedAt: user.createdAt },
        privacyPolicy: { version: VERSIONS.privacyPolicyVersion, acceptedAt: user.createdAt },
      },
    });
    await jobs.createJob({
      jobId: "job_analytics_generation",
      userId: user.userId,
      kind: "greeting_generate",
      status: "succeeded",
      statusHistory: [
        { status: "generating", enteredAt: "2026-08-02T02:00:00.000Z" },
        { status: "succeeded", enteredAt: "2026-08-02T02:01:00.000Z" },
      ],
      createdAt: "2026-08-02T02:00:00.000Z",
      updatedAt: "2026-08-02T02:01:00.000Z",
    });
    await applications.create({
      applicationId: "application_analytics_owned",
      jobId: "job_analytics_generation",
      userId: user.userId,
      resumeId: "resume_analytics",
      status: "not_applied",
      greetingBody: "不得进入分析事件的正文",
      evidence: [],
      factSnapshot: [],
      jdSnapshot: {
        jobTitle: { fieldId: "jd_job_title", text: "该岗位", confidence: 1 },
        responsibilities: [],
        hardSkills: [],
        experienceEducation: [],
        locationWorkMode: [],
        availabilityDuration: [],
      },
      omittedRequirements: [],
      warnings: [],
      createdAt: "2026-08-02T02:01:00.000Z",
      updatedAt: "2026-08-02T02:01:00.000Z",
    });
    let now = new Date("2026-08-04T02:00:00.000Z");
    const api = createIdentityAccessApi({
      repository: identities,
      idempotency: new IdempotencyService(new InMemoryIdempotencyRepository()),
      analytics: new AnalyticsService(identities, jobs, applications),
      currentVersions: VERSIONS,
      adminOpenIds: [],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_analytics_user" }),
    });

    await expect(api({ action: "analytics.track", payload: { event: "app_opened" } })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    const openRequest = {
      action: "analytics.track" as const,
      payload: { event: "app_opened" },
      requestId: "00000001-6789-4234-a234-123456789abc",
    };
    expect(await api(openRequest)).toMatchObject({ ok: true, data: { tracked: true } });
    expect(await api(openRequest)).toMatchObject({ ok: true, data: { tracked: true } });

    now = new Date("2026-08-04T02:01:00.000Z");
    expect(
      await api({
        action: "analytics.track",
        payload: { event: "greeting_copied", applicationId: "application_analytics_owned" },
        requestId: "00000002-6789-4234-a234-123456789abc",
      }),
    ).toMatchObject({ ok: true, data: { tracked: true } });
    expect(
      await api({
        action: "analytics.track",
        payload: { event: "greeting_copied", applicationId: "application_missing" },
        requestId: "00000003-6789-4234-a234-123456789abc",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    const saved = await identities.getUserById(user.userId);
    expect(saved?.participation).toEqual({
      firstAppOpenedAt: "2026-08-04T02:00:00.000Z",
      lastAppOpenedAt: "2026-08-04T02:00:00.000Z",
      returnedWithinSevenDaysAt: "2026-08-04T02:00:00.000Z",
      firstGreetingCopiedAt: "2026-08-04T02:01:00.000Z",
    });
    expect(JSON.stringify(saved)).not.toContain("不得进入分析事件的正文");
  });

  it("rejects payload fields outside the two-event allowlist", async () => {
    const api = createIdentityAccessApi({
      repository: new InMemoryIdentityRepository(),
      analytics: new AnalyticsService(
        new InMemoryIdentityRepository(),
        new InMemoryJobRepository(),
        new InMemoryApplicationRepository(),
      ),
      currentVersions: VERSIONS,
      adminOpenIds: [],
      now: () => new Date(),
      readCloudBaseContext: () => ({ OPENID: "wx_invalid_analytics" }),
    });
    await expect(
      api({
        action: "analytics.track",
        payload: { event: "app_opened", greetingBody: "forbidden" },
        requestId: "00000004-6789-4234-a234-123456789abc",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });
});
