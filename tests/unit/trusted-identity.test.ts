import { describe, expect, it } from "vitest";

import {
  ActionRegistry,
  createApiEntry,
} from "../../cloudfunctions/api/src/index.js";

describe("trusted CloudBase identity boundary", () => {
  it("uses only OPENID from the trusted context and ignores client identity", async () => {
    const registry = new ActionRegistry();
    registry.register("user.get", async (_payload, context) => ({
      ok: true,
      data: { trustedOpenId: context.trustedOpenId },
    }));
    const api = createApiEntry({
      registry,
      readCloudBaseContext: () => ({ OPENID: "wx_trusted_user" }),
    });

    await expect(
      api({
        action: "user.get",
        payload: {
          openId: "wx_forged_user",
          userId: "user_forged",
        },
        openId: "wx_forged_envelope",
      }),
    ).resolves.toEqual({
      ok: true,
      data: { trustedOpenId: "wx_trusted_user" },
    });
  });

  it("rejects a missing or malformed trusted OPENID", async () => {
    const registry = new ActionRegistry();
    registry.register("user.get", async () => ({ ok: true, data: {} }));

    for (const OPENID of [undefined, "", 123]) {
      const api = createApiEntry({
        registry,
        readCloudBaseContext: () => ({ OPENID }),
      });

      await expect(api({ action: "user.get", payload: {} })).resolves.toEqual({
        ok: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required.",
          retryable: false,
        },
      });
    }
  });

  it("rejects malformed requests before dispatch", async () => {
    const registry = new ActionRegistry();
    const api = createApiEntry({
      registry,
      readCloudBaseContext: () => ({ OPENID: "wx_trusted_user" }),
    });

    const response = await api({ action: "USER.GET", payload: {} });

    expect(response).toEqual({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid request.",
        retryable: false,
      },
    });
    expect(JSON.stringify(response)).not.toContain("Zod");
  });
});
