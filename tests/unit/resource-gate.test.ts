import { describe, expect, it } from "vitest";

import {
  ActionRegistry,
  IdempotencyService,
  InMemoryIdempotencyRepository,
  ResourceGateService,
  createApiEntry,
  hashTrustedOpenId,
  type FreeResource,
} from "../../cloudfunctions/api/src/index.js";

const writeRequestId = "123e4567-e89b-42d3-a456-426614174000";

describe("free resource pause gate", () => {
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
