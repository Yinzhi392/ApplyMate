import { describe, expect, it } from "vitest";

import {
  AdminStatsService,
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryOperationsRepository,
  InMemoryQuotaRepository,
  InMemoryFeedbackRepository,
  InMemoryJobRepository,
  InMemoryResumeRepository,
  ProductMetricsService,
  QuotaService,
  UserService,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const NOW = new Date("2026-08-06T04:00:00.000Z");
const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-6789-4234-a234-123456789abc`;
}

function readString(response: unknown, field: string): string {
  if (
    typeof response !== "object" ||
    response === null ||
    Reflect.get(response, "ok") !== true
  ) {
    throw new Error("Expected a successful response.");
  }
  const data = Reflect.get(response, "data");
  const value =
    typeof data === "object" && data !== null
      ? Reflect.get(data, field)
      : undefined;
  if (typeof value !== "string") {
    throw new Error(`Expected ${field}.`);
  }
  return value;
}

describe("administrator operations", () => {
  it("audits idempotent writes, rejects forged access, and returns metadata-only stats", async () => {
    const identities = new InMemoryIdentityRepository();
    const quotaRepository = new InMemoryQuotaRepository();
    const operations = new InMemoryOperationsRepository();
    const resumes = new InMemoryResumeRepository();
    const jobs = new InMemoryJobRepository();
    const feedback = new InMemoryFeedbackRepository();
    const target = await new UserService(identities).getOrCreateUser(
      "wx_admin_stats_target",
      NOW,
    );
    await operations.recordResourceUsage({
      logId: "resource_admin_stats_model",
      userId: target.userId,
      resource: "model",
      operation: "greeting.generate",
      units: 321,
      unitName: "tokens",
      estimatedCostYuan: 0,
      actualCostYuan: 0,
      durationMs: 900,
      status: "succeeded",
      modelId: "synthetic-model",
      promptVersion: "greeting-v1",
      contentHash: "a".repeat(64),
      createdAt: NOW.toISOString(),
    });
    let openId = "wx_admin_stats_admin";
    const api = createIdentityAccessApi({
      repository: identities,
      idempotency: new IdempotencyService(
        new InMemoryIdempotencyRepository(),
      ),
      quotas: new QuotaService(quotaRepository),
      adminStats: new AdminStatsService(
        identities,
        quotaRepository,
        operations,
        new ProductMetricsService(
          identities,
          resumes,
          jobs,
          feedback,
          new Set(["user_admin_synthetic"]),
        ),
      ),
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_admin_stats_admin"],
      now: () => NOW,
      generateInviteCode: () => "AM-AUDIT-0001",
      readCloudBaseContext: () => ({ OPENID: openId }),
    });
    await api({
      action: "agreement.accept",
      payload: VERSIONS,
      requestId: requestId(1),
    });

    const inviteRequest = {
      action: "admin.inviteCreate" as const,
      payload: {},
      requestId: requestId(2),
    };
    const created = await api(inviteRequest);
    expect(await api(inviteRequest)).toEqual(created);
    const inviteId = readString(created, "inviteId");
    const revokeRequest = {
      action: "admin.inviteRevoke" as const,
      payload: { inviteId },
      requestId: requestId(3),
    };
    const revoked = await api(revokeRequest);
    expect(await api(revokeRequest)).toEqual(revoked);

    const statusRequest = {
      action: "admin.userSetEnabled" as const,
      payload: {
        targetUserId: target.userId,
        enabled: false,
        reason: "synthetic admin audit",
      },
      requestId: requestId(4),
    };
    const status = await api(statusRequest);
    expect(await api(statusRequest)).toEqual(status);
    const quotaRequest = {
      action: "admin.quotaAdjust" as const,
      payload: {
        targetUserId: target.userId,
        increase: 2,
        reason: "synthetic admin quota",
      },
      requestId: requestId(5),
    };
    const quota = await api(quotaRequest);
    expect(await api(quotaRequest)).toEqual(quota);

    expect(identities.listAuditRecords()).toMatchObject([
      { action: "admin.inviteCreate" },
      { action: "admin.inviteRevoke" },
      { action: "admin.userSetEnabled" },
    ]);
    expect(quotaRepository.listAuditRecords()).toMatchObject([
      { action: "admin.quotaAdjust" },
    ]);
    const stats = await api({ action: "admin.stats", payload: {} });
    expect(stats).toMatchObject({
      ok: true,
      data: {
        dateKey: "2026-08-06",
        users: {
          total: 2,
          enabled: 1,
          disabled: 1,
          pendingDeletion: 0,
        },
        invitations: { total: 1, active: 0, consumed: 0, revoked: 1 },
        quota: {
          users: 1,
          reserved: 0,
          succeeded: 0,
          temporaryIncrease: 2,
        },
        auditEvents: 4,
        resources: [
          { resource: "ocr", calls: 0, actualCostYuan: 0 },
          { resource: "model", calls: 1, actualCostYuan: 0 },
          { resource: "cloud_function", calls: 0, actualCostYuan: 0 },
          { resource: "storage", calls: 0, actualCostYuan: 0 },
          { resource: "traffic", calls: 0, actualCostYuan: 0 },
        ],
        productMetrics: {
          firstResumeConfirmationRate: { numerator: 0, denominator: 0, rate: null },
          generationSuccessRate: { numerator: 0, denominator: 0, rate: null },
          copyRate: { numerator: 0, denominator: 0, rate: null },
          satisfactionRate: { numerator: 0, denominator: 0, rate: null },
          sevenDayReturnRate: { numerator: 0, denominator: 0, rate: null },
        },
      },
    });

    openId = "wx_admin_stats_normal";
    await api({
      action: "agreement.accept",
      payload: VERSIONS,
      requestId: requestId(6),
    });
    await expect(
      api({
        action: "admin.stats",
        payload: {},
        OPENID: "wx_admin_stats_admin",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    await expect(
      api({
        action: "admin.inviteCreate",
        payload: { isAdmin: true, OPENID: "wx_admin_stats_admin" },
        requestId: requestId(7),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });
});
