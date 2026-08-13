import { describe, expect, it } from "vitest";

import {
  InMemoryFeedbackRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  ProductMetricsService,
  UserService,
} from "../../cloudfunctions/api/src/index.js";

const ACTIVATED_AT = "2026-08-01T02:00:00.000Z";

describe("ProductMetricsService", () => {
  it("returns deduplicated numerators, denominators, rates, and excludes configured users", async () => {
    const identities = new InMemoryIdentityRepository();
    const resumes = new InMemoryResumeRepository();
    const jobs = new InMemoryJobRepository();
    const feedback = new InMemoryFeedbackRepository();
    const users = new UserService(identities);
    const included = await users.getOrCreateUser(
      "wx_metrics_included",
      new Date(ACTIVATED_AT),
    );
    const excluded = await users.getOrCreateUser(
      "wx_metrics_excluded",
      new Date(ACTIVATED_AT),
    );
    for (const user of [included, excluded]) {
      await identities.saveUser({
        ...user,
        activationStatus: "active",
        activatedAt: ACTIVATED_AT,
        participation: {
          firstAppOpenedAt: ACTIVATED_AT,
          lastAppOpenedAt: "2026-08-04T02:00:00.000Z",
          firstGreetingCopiedAt: "2026-08-02T02:00:00.000Z",
          returnedWithinSevenDaysAt: "2026-08-04T02:00:00.000Z",
        },
      });
      await resumes.createDraftIfBelowLimit(
        {
          resumeId: `resume_${user.userId.slice(-8)}`,
          userId: user.userId,
          jobId: `job_resume_${user.userId}`,
          inputType: "text",
          temporaryFileIds: [],
          status: "confirmed",
          isDefault: true,
          createdAt: ACTIVATED_AT,
          updatedAt: "2026-08-02T02:00:00.000Z",
          confirmedAt: "2026-08-02T02:00:00.000Z",
        },
        3,
      );
      await jobs.createJob({
        jobId: `job_generate_${user.userId}`,
        userId: user.userId,
        kind: "greeting_generate",
        status: "succeeded",
        statusHistory: [
          { status: "queued", enteredAt: ACTIVATED_AT },
          { status: "generating", enteredAt: "2026-08-02T01:59:00.000Z" },
          { status: "succeeded", enteredAt: "2026-08-02T02:00:00.000Z" },
        ],
        createdAt: ACTIVATED_AT,
        updatedAt: "2026-08-02T02:00:00.000Z",
      });
      await feedback.upsert({
        feedbackId: `feedback_${user.userId}`,
        applicationId: `application_${user.userId}`,
        userId: user.userId,
        rating: "satisfied",
        createdAt: "2026-08-02T02:00:00.000Z",
        updatedAt: "2026-08-03T02:00:00.000Z",
      });
    }

    const service = new ProductMetricsService(
      identities,
      resumes,
      jobs,
      feedback,
      new Set([excluded.userId]),
    );

    await expect(service.get()).resolves.toEqual({
      firstResumeConfirmationRate: { numerator: 1, denominator: 1, rate: 1 },
      generationSuccessRate: { numerator: 1, denominator: 1, rate: 1 },
      copyRate: { numerator: 1, denominator: 1, rate: 1 },
      satisfactionRate: { numerator: 1, denominator: 1, rate: 1 },
      sevenDayReturnRate: { numerator: 1, denominator: 1, rate: 1 },
    });
  });

  it("returns null rates when a denominator is zero", async () => {
    const service = new ProductMetricsService(
      new InMemoryIdentityRepository(),
      new InMemoryResumeRepository(),
      new InMemoryJobRepository(),
      new InMemoryFeedbackRepository(),
    );

    const metrics = await service.get();
    expect(Object.values(metrics)).toEqual(
      Array.from({ length: 5 }, () => ({ numerator: 0, denominator: 0, rate: null })),
    );
  });
});
