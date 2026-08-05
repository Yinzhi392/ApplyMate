import { describe, expect, it } from "vitest";

import {
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryQuotaRepository,
  QuotaService,
  UserService,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-1234-4234-a234-123456789abc`;
}

describe("admin.quotaAdjust", () => {
  it("adds only today's temporary quota once and records an audit", async () => {
    const identityRepository = new InMemoryIdentityRepository();
    const quotaRepository = new InMemoryQuotaRepository();
    const quotas = new QuotaService(quotaRepository);
    const target = await new UserService(identityRepository).getOrCreateUser(
      "wx_synthetic_target",
      new Date("2026-08-05T12:00:00.000Z"),
    );
    let now = new Date("2026-08-05T12:00:00.000Z");
    const api = createIdentityAccessApi({
      repository: identityRepository,
      idempotency: new IdempotencyService(
        new InMemoryIdempotencyRepository(),
      ),
      quotas,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_admin" }),
    });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(1),
    });
    const adjustment = {
      action: "admin.quotaAdjust" as const,
      payload: {
        targetUserId: target.userId,
        increase: 2,
        reason: "synthetic test allowance",
      },
      requestId: requestId(2),
    };

    const first = await api(adjustment);
    const replay = await api(adjustment);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      ok: true,
      data: {
        targetUserId: target.userId,
        dateKey: "2026-08-05",
        temporaryIncrease: 2,
        limit: 7,
      },
    });
    expect(quotaRepository.listAuditRecords()).toHaveLength(1);
    expect(JSON.stringify(quotaRepository.listAuditRecords())).not.toContain(
      "wx_synthetic",
    );

    now = new Date("2026-08-05T16:00:00.000Z");
    await expect(quotas.getUsage(target.userId, now)).resolves.toMatchObject({
      dateKey: "2026-08-06",
      temporaryIncrease: 0,
      limit: 5,
    });
  });

  it("rejects invalid amounts, missing reasons, and normal users", async () => {
    const identityRepository = new InMemoryIdentityRepository();
    const quotas = new QuotaService(new InMemoryQuotaRepository());
    const target = await new UserService(identityRepository).getOrCreateUser(
      "wx_synthetic_target",
      new Date("2026-08-05T12:00:00.000Z"),
    );
    let openId = "wx_synthetic_admin";
    const api = createIdentityAccessApi({
      repository: identityRepository,
      quotas,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: openId }),
    });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(3),
    });

    for (const [index, payload] of [
      { targetUserId: target.userId, increase: -1, reason: "invalid" },
      { targetUserId: target.userId, increase: 0, reason: "invalid" },
      { targetUserId: target.userId, increase: 1, reason: "" },
    ].entries()) {
      await expect(
        api({
          action: "admin.quotaAdjust",
          payload,
          requestId: requestId(4 + index),
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    }

    openId = "wx_synthetic_normal";
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(7),
    });
    await expect(
      api({
        action: "admin.quotaAdjust",
        payload: {
          targetUserId: target.userId,
          increase: 1,
          reason: "forged",
        },
        requestId: requestId(8),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
