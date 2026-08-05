import { describe, expect, it } from "vitest";

import {
  ActionRegistry,
  DomainError,
} from "../../cloudfunctions/api/src/index.js";

const execution = {
  trustedOpenId: "wx_test_user_a",
  requestId: undefined,
};

describe("API action registry", () => {
  it("dispatches only an explicitly registered action", async () => {
    const registry = new ActionRegistry();
    registry.register("auth.status", async () => ({
      ok: true,
      data: { state: "ready" },
    }));

    await expect(registry.dispatch("auth.status", {}, execution)).resolves.toEqual({
      ok: true,
      data: { state: "ready" },
    });
  });

  it.each(["unknown.action", "AUTH.STATUS", "Auth.Status"])(
    "rejects unregistered action %s",
    async (action) => {
      const registry = new ActionRegistry();

      await expect(registry.dispatch(action, {}, execution)).resolves.toEqual({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Unsupported action.",
          retryable: false,
        },
      });
    },
  );

  it("converts handler errors without leaking stack details", async () => {
    const registry = new ActionRegistry();
    registry.register("auth.status", async () => {
      throw new Error("secret internal path /private/service.ts");
    });

    const response = await registry.dispatch("auth.status", {}, execution);

    expect(response).toEqual({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        retryable: false,
      },
    });
    expect(JSON.stringify(response)).not.toContain("/private/service.ts");
  });

  it("preserves safe domain errors", async () => {
    const registry = new ActionRegistry();
    registry.register("auth.status", async () => {
      throw new DomainError("AGREEMENT_REQUIRED", "Please accept current agreements.");
    });

    await expect(registry.dispatch("auth.status", {}, execution)).resolves.toEqual({
      ok: false,
      error: {
        code: "AGREEMENT_REQUIRED",
        message: "Please accept current agreements.",
        retryable: false,
      },
    });
  });
});
