import { describe, expect, it } from "vitest";

type SafetyHandler = (event: unknown) => Promise<unknown>;

function loadSafetyHandler(runtime: "worker" | "cleanup"): SafetyHandler {
  // The deployed handlers intentionally have no runtime dependencies.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(`../../cloudfunctions/${runtime}/deploy/index.js`).main as SafetyHandler;
}

describe("CloudBase deployment safety gates", () => {
  for (const runtime of ["worker", "cleanup"] as const) {
    it(`${runtime} exposes a synthetic-only health state and refuses user traffic`, async () => {
      const handler = loadSafetyHandler(runtime);

      await expect(handler({ healthcheck: true })).resolves.toEqual({
        ok: true,
        data: {
          runtime,
          state: "reliability_probe_live",
          acceptsUserTraffic: false,
        },
      });
      await expect(handler({ action: "auth.status", payload: {} })).resolves.toMatchObject({
        ok: false,
        error: { code: "RESOURCE_PAUSED", retryable: true },
      });
    });
  }
});
