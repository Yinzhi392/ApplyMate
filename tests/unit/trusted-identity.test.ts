import { describe, expect, it } from "vitest";

import {
  ActionRegistry,
  createApiEntry,
  hashTrustedIdentity,
  hashTrustedOpenId,
} from "../../cloudfunctions/api/src/index.js";

describe("trusted CloudBase identity boundary", () => {
  it("uses only OPENID from the trusted context and ignores client identity", async () => {
    const registry = new ActionRegistry();
    let receivedPayload: Record<string, unknown> | undefined;
    registry.register("user.get", async (payload, context) => {
      receivedPayload = payload;
      return {
        ok: true,
        data: { trustedOpenId: context.trustedOpenId },
      };
    });
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
          filters: {
            uid: "nested_forged_uid",
            keep: "safe-filter",
          },
          rows: [{ identityHash: "nested_forged_hash", keep: "safe-row" }],
        },
        openId: "wx_forged_envelope",
      }),
    ).resolves.toEqual({
      ok: true,
      data: { trustedOpenId: "wx_trusted_user" },
    });
    expect(receivedPayload).toEqual({
      filters: { keep: "safe-filter" },
      rows: [{ keep: "safe-row" }],
    });
  });

  it("uses an authenticated anonymous UID when no mini-program OPENID exists", async () => {
    const registry = new ActionRegistry();
    registry.register("user.get", async (_payload, context) => ({
      ok: true,
      data: {
        identity: context.trustedOpenId,
        namespace: context.identityNamespace ?? "applymate-openid-v1",
      },
    }));
    const api = createApiEntry({
      registry,
      readCloudBaseContext: () => ({
        uid: "anonymous_uid_a",
        isAnonymous: true,
      }),
    });

    await expect(api({
      action: "user.get",
      payload: { uid: "forged_uid", userId: "forged_user" },
    })).resolves.toEqual({
      ok: true,
      data: {
        identity: "anonymous_uid_a",
        namespace: "web-anonymous-uid-v1",
      },
    });
    expect(hashTrustedIdentity("same_value", "web-anonymous-uid-v1"))
      .not.toBe(hashTrustedOpenId("same_value"));
  });

  it("treats an unmarked Web UID as the configured email identity", async () => {
    const registry = new ActionRegistry();
    registry.register("user.get", async (_payload, context) => ({
      ok: true,
      data: { namespace: context.identityNamespace ?? "applymate-openid-v1" },
    }));
    const api = createApiEntry({
      registry,
      readCloudBaseContext: () => ({ uid: "registered_email_without_marker" }),
    });

    await expect(api({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { namespace: "web-email-uid-v1" },
    });
  });

  it("uses a separate registered-email namespace and strips client email fields", async () => {
    const registry = new ActionRegistry();
    let receivedPayload: Record<string, unknown> | undefined;
    registry.register("user.get", async (payload, context) => {
      receivedPayload = payload;
      return {
        ok: true,
        data: {
          namespace: context.identityNamespace ?? "applymate-openid-v1",
        },
      };
    });
    const api = createApiEntry({
      registry,
      readCloudBaseContext: () => ({
        uid: "registered_email_uid",
        isAnonymous: "false",
      }),
    });

    await expect(api({
      action: "user.get",
      payload: {
        email: "forged@example.com",
        profile: { emailAddress: "nested@example.com", keep: "safe" },
      },
    })).resolves.toMatchObject({
      ok: true,
      data: { namespace: "web-email-uid-v1" },
    });
    expect(receivedPayload).toEqual({ profile: { keep: "safe" } });
    expect(hashTrustedIdentity("same_value", "web-email-uid-v1"))
      .not.toBe(hashTrustedIdentity("same_value", "web-anonymous-uid-v1"));
  });

  it("keeps OPENID as the Legacy identity when both identifiers exist", async () => {
    const registry = new ActionRegistry();
    registry.register("user.get", async (_payload, context) => ({
      ok: true,
      data: {
        identity: context.trustedOpenId,
        namespace: context.identityNamespace ?? "applymate-openid-v1",
      },
    }));
    const api = createApiEntry({
      registry,
      readCloudBaseContext: () => ({ OPENID: "wx_legacy", uid: "anonymous_web" }),
    });

    await expect(api({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { identity: "wx_legacy", namespace: "applymate-openid-v1" },
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
