import { describe, expect, it } from "vitest";

import {
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryOperationsRepository,
  InMemoryQuotaRepository,
  UserService,
  type JobRecord,
} from "../../cloudfunctions/api/src/index.js";
import {
  InMemoryAnonymousAggregateRepository,
  OperationalLogCleanupService,
} from "../../cloudfunctions/cleanup/src/index.js";

const NOW = new Date("2026-08-06T08:00:00.000Z");
const DAY = 24 * 60 * 60 * 1_000;
const CUTOFF = new Date(NOW.getTime() - 180 * DAY);

describe("operational log retention", () => {
  it("removes only logs older than 180 days and expired idempotency mappings", async () => {
    const identities = new InMemoryIdentityRepository();
    const actor = await new UserService(identities).getOrCreateUser(
      "wx_retention_actor",
      CUTOFF,
    );
    const target = await new UserService(identities).getOrCreateUser(
      "wx_retention_target",
      CUTOFF,
    );
    await identities.setUserEnabledWithAudit(target.userId, false, {
      auditId: "audit_retention_old",
      action: "admin.userSetEnabled",
      actorUserId: actor.userId,
      targetUserId: target.userId,
      enabled: false,
      reason: "synthetic old audit",
      createdAt: new Date(CUTOFF.getTime() - 1).toISOString(),
    });
    await identities.setUserEnabledWithAudit(target.userId, true, {
      auditId: "audit_retention_boundary",
      action: "admin.userSetEnabled",
      actorUserId: actor.userId,
      targetUserId: target.userId,
      enabled: true,
      reason: "synthetic boundary audit",
      createdAt: CUTOFF.toISOString(),
    });

    const quotas = new InMemoryQuotaRepository();
    for (const [suffix, createdAt] of [
      ["old", new Date(CUTOFF.getTime() - 1)],
      ["boundary", CUTOFF],
    ] as const) {
      await quotas.increaseTemporaryQuota(
        target.userId,
        "2026-02-07",
        1,
        {
          auditId: `audit_quota_retention_${suffix}`,
          action: "admin.quotaAdjust",
          actorUserId: actor.userId,
          targetUserId: target.userId,
          dateKey: "2026-02-07",
          increase: 1,
          reason: `synthetic ${suffix} quota audit`,
          createdAt: createdAt.toISOString(),
        },
        createdAt,
      );
    }

    const operations = new InMemoryOperationsRepository();
    for (const [suffix, createdAt] of [
      ["old", new Date(CUTOFF.getTime() - 1)],
      ["boundary", CUTOFF],
    ] as const) {
      await operations.recordResourceUsage({
        logId: `resource_retention_${suffix}`,
        userId: target.userId,
        resource: "model",
        operation: "greeting.generate",
        units: 1,
        unitName: "calls",
        estimatedCostYuan: 0,
        actualCostYuan: 0,
        durationMs: 1,
        status: "succeeded",
        contentHash: "d".repeat(64),
        createdAt: createdAt.toISOString(),
      });
    }

    const idempotencyRepository = new InMemoryIdempotencyRepository();
    const idempotency = new IdempotencyService(idempotencyRepository);
    const runIdempotent = (caller: string, time: Date) =>
      idempotency.execute(
        caller,
        "user.updatePreferences",
        caller === "valid"
          ? "80000011-6789-4234-a234-123456789abc"
          : "80000012-6789-4234-a234-123456789abc",
        { preferenceText: caller },
        () => time,
        async () => ({ ok: true, data: { caller } }),
      );
    await runIdempotent("expired", new Date(NOW.getTime() - 25 * 60 * 60 * 1_000));
    await runIdempotent("valid", new Date(NOW.getTime() - 23 * 60 * 60 * 1_000));

    const jobs = new InMemoryJobRepository();
    const unfinished: JobRecord = {
      jobId: "job_retention_unfinished",
      userId: target.userId,
      kind: "greeting_generate",
      status: "queued",
      statusHistory: [{ status: "queued", enteredAt: NOW.toISOString() }],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    await jobs.createJob(unfinished);
    const aggregates = new InMemoryAnonymousAggregateRepository();
    await aggregates.increment("2026-08-06", "accounts_deleted");

    const cleanup = new OperationalLogCleanupService({
      identities,
      quotas,
      operations,
      idempotency: idempotencyRepository,
    });
    await expect(cleanup.run(NOW)).resolves.toEqual({
      identityAuditLogs: 1,
      quotaAuditLogs: 1,
      resourceLogs: 1,
      expiredIdempotencyMappings: 1,
    });
    expect(identities.listAuditRecords()).toMatchObject([
      { auditId: "audit_retention_boundary" },
    ]);
    expect(quotas.listAuditRecords()).toMatchObject([
      { auditId: "audit_quota_retention_boundary" },
    ]);
    expect(await operations.listResourceUsage()).toMatchObject([
      { logId: "resource_retention_boundary" },
    ]);
    await expect(
      jobs.getJobById("job_retention_unfinished"),
    ).resolves.toMatchObject({ status: "queued" });
    await expect(aggregates.list()).resolves.toEqual([
      { dateKey: "2026-08-06", metric: "accounts_deleted", count: 1 },
    ]);

    let validReexecuted = false;
    await idempotency.execute(
      "valid",
      "user.updatePreferences",
      "80000011-6789-4234-a234-123456789abc",
      { preferenceText: "valid" },
      () => NOW,
      async () => {
        validReexecuted = true;
        return { ok: true, data: { unexpected: true } };
      },
    );
    expect(validReexecuted).toBe(false);
  });
});
