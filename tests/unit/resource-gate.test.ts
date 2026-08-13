import { describe, expect, it } from "vitest";

import {
  ActionRegistry,
  IdempotencyService,
  InMemoryIdempotencyRepository,
  ResourceGateService,
  RESOURCE_KINDS,
  evaluateZeroCostChecklist,
  createApiEntry,
  hashTrustedOpenId,
  type FreeResource,
  type ResourceKind,
  type ZeroCostResourceSnapshot,
} from "../../cloudfunctions/api/src/index.js";

const writeRequestId = "123e4567-e89b-42d3-a456-426614174000";

describe("free resource pause gate", () => {
  const now = new Date("2026-08-11T06:00:00.000Z");
  const healthySnapshots = (): ZeroCostResourceSnapshot[] =>
    RESOURCE_KINDS.map((resource) => ({
      resource,
      status: "available",
      freeUnitsRemaining: 100,
      requiredUnitsForNextAiJob: 1,
      postpaidEnabled: false,
      actualCostYuan: 0,
      checkedAt: now.toISOString(),
    }));
  const gateResource = (resource: ResourceKind): FreeResource =>
    resource === "ocr"
      ? "ocr"
      : resource === "model"
        ? "model"
        : "compute_storage";

  it.each<FreeResource>(["ocr", "model", "compute_storage"])(
    "blocks %s-dependent AI work before reservation but keeps data access",
    async (pausedResource) => {
      const registry = new ActionRegistry();
      let reservations = 0;
      registry.register("resume.parse", async () => {
        reservations += 1;
        return { ok: true, data: { jobId: "job_should_not_exist" } };
      });
      registry.register("user.get", async () => ({
        ok: true,
        data: { readable: true },
      }));
      registry.register("user.delete", async () => ({
        ok: true,
        data: { deleted: true },
      }));
      const api = createApiEntry({
        registry,
        readCloudBaseContext: () => ({ OPENID: "wx_synthetic_user" }),
        resourceGate: {
          service: new ResourceGateService({
            ocr: pausedResource !== "ocr",
            model: pausedResource !== "model",
            compute_storage: pausedResource !== "compute_storage",
          }),
          resolveRequirements: (action) =>
            action === "resume.parse" ? [pausedResource] : [],
        },
      });

      await expect(
        api({
          action: "resume.parse",
          payload: {},
          requestId: writeRequestId,
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "RESOURCE_PAUSED" },
      });
      expect(reservations).toBe(0);
      await expect(api({ action: "user.get", payload: {} })).resolves.toMatchObject({
        ok: true,
        data: { readable: true },
      });
      await expect(
        api({
          action: "user.delete",
          payload: {},
          requestId: writeRequestId,
        }),
      ).resolves.toMatchObject({ ok: true, data: { deleted: true } });
    },
  );

  it.each<ResourceKind>(RESOURCE_KINDS)(
    "pauses AI work when %s reaches its per-job free-unit threshold",
    async (thresholdResource) => {
      const snapshots = healthySnapshots().map((snapshot) =>
        snapshot.resource === thresholdResource
          ? {
              ...snapshot,
              freeUnitsRemaining: 0,
              requiredUnitsForNextAiJob: 1,
            }
          : snapshot,
      );
      const checklist = evaluateZeroCostChecklist(snapshots, now);
      const decision = checklist.decisions.find(
        (item) => item.resource === thresholdResource,
      );
      expect(decision).toMatchObject({
        shouldPause: true,
        reasons: ["INSUFFICIENT_FREE_UNITS"],
      });

      const registry = new ActionRegistry();
      let aiDispatches = 0;
      registry.register("generation.create", async () => {
        aiDispatches += 1;
        return { ok: true, data: { jobId: "job_should_not_exist" } };
      });
      registry.register("user.get", async () => ({
        ok: true,
        data: { readable: true },
      }));
      registry.register("user.delete", async () => ({
        ok: true,
        data: { deleted: true },
      }));
      const api = createApiEntry({
        registry,
        readCloudBaseContext: () => ({ OPENID: "wx_synthetic_user" }),
        resourceGate: {
          service: new ResourceGateService(checklist.availability),
          resolveRequirements: (action) =>
            action === "generation.create"
              ? [gateResource(thresholdResource)]
              : [],
        },
      });

      await expect(
        api({
          action: "generation.create",
          payload: {},
          requestId: writeRequestId,
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "RESOURCE_PAUSED" },
      });
      expect(aiDispatches).toBe(0);
      await expect(api({ action: "user.get", payload: {} })).resolves.toMatchObject({
        ok: true,
        data: { readable: true },
      });
      await expect(
        api({
          action: "user.delete",
          payload: {},
          requestId: writeRequestId,
        }),
      ).resolves.toMatchObject({ ok: true, data: { deleted: true } });
    },
  );

  it("fails closed for stale checks, postpaid mode, non-zero cost, and unknown status", () => {
    const snapshots = healthySnapshots().map((snapshot) => {
      switch (snapshot.resource) {
        case "ocr":
          return { ...snapshot, status: "unknown" as const };
        case "model":
          return { ...snapshot, postpaidEnabled: true };
        case "cloud_function":
          return { ...snapshot, actualCostYuan: 0.01 };
        case "storage":
          return {
            ...snapshot,
            checkedAt: new Date(
              now.getTime() - 24 * 60 * 60 * 1_000 - 1,
            ).toISOString(),
          };
        case "traffic":
          return snapshot;
      }
    });

    const result = evaluateZeroCostChecklist(snapshots, now);
    expect(result.decisions).toEqual([
      expect.objectContaining({
        resource: "ocr",
        reasons: ["RESOURCE_NOT_AVAILABLE"],
      }),
      expect.objectContaining({
        resource: "model",
        reasons: ["POSTPAID_ENABLED"],
      }),
      expect.objectContaining({
        resource: "cloud_function",
        reasons: ["ACTUAL_COST_NOT_ZERO"],
      }),
      expect.objectContaining({
        resource: "storage",
        reasons: ["SNAPSHOT_STALE_OR_FUTURE"],
      }),
      expect.objectContaining({
        resource: "traffic",
        reasons: [],
      }),
    ]);
    expect(result.availability).toEqual({
      ocr: false,
      model: false,
      compute_storage: false,
    });
  });

  it("rejects incomplete or duplicate five-resource checklists", () => {
    expect(() => evaluateZeroCostChecklist(healthySnapshots().slice(1), now)).toThrow(
      "Missing zero-cost resource: ocr",
    );
    expect(() =>
      evaluateZeroCostChecklist(
        [...healthySnapshots(), healthySnapshots()[0]!],
        now,
      ),
    ).toThrow("Duplicate zero-cost resource: ocr");
  });

  it("replays a completed request after resources pause but blocks a new request", async () => {
    const registry = new ActionRegistry();
    const idempotency = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    let dispatches = 0;
    registry.register("resume.parse", async () => {
      dispatches += 1;
      return { ok: true, data: { jobId: "job_original" } };
    });
    const createApi = (ocrAvailable: boolean) =>
      createApiEntry({
        registry,
        readCloudBaseContext: () => ({ OPENID: "wx_synthetic_user" }),
        idempotency: {
          service: idempotency,
          createCallerKey: hashTrustedOpenId,
          now: () => new Date("2026-08-05T12:00:00.000Z"),
        },
        resourceGate: {
          service: new ResourceGateService({
            ocr: ocrAvailable,
            model: true,
            compute_storage: true,
          }),
          resolveRequirements: (action) =>
            action === "resume.parse" ? ["ocr"] : [],
        },
      });
    const request = {
      action: "resume.parse" as const,
      payload: {},
      requestId: writeRequestId,
    };

    const first = await createApi(true)(request);
    const replay = await createApi(false)(request);
    const newRequest = await createApi(false)({
      ...request,
      requestId: "123e4567-e89b-42d3-a456-426614174001",
    });

    expect(first).toMatchObject({
      ok: true,
      data: { jobId: "job_original" },
    });
    expect(replay).toEqual(first);
    expect(newRequest).toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PAUSED" },
    });
    expect(dispatches).toBe(1);
  });
});
