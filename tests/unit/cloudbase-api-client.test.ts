import { describe, expect, it, vi } from "vitest";

import {
  applyRuntimeModeFromLaunchQuery,
  createCloudBaseApiClient,
  isCloudBaseIdentityTestMode,
  RUNTIME_MODE_LAUNCH_QUERY_KEY,
  RUNTIME_MODE_STORAGE_KEY,
} from "../../miniprogram/services/cloudbase-api.js";

describe("CloudBase identity-test client", () => {
  it("is disabled unless the explicit local switch is present", () => {
    expect(isCloudBaseIdentityTestMode({ get: () => undefined })).toBe(false);
    expect(isCloudBaseIdentityTestMode({
      get: (key) => key === RUNTIME_MODE_STORAGE_KEY ? "cloudbase_identity_test" : undefined,
    })).toBe(true);
  });

  it("enables the restricted runtime from an explicit preview launch query", () => {
    const values = new Map<string, string>();
    const storage = { set: (key: string, value: string) => values.set(key, value) };

    expect(applyRuntimeModeFromLaunchQuery(undefined, storage)).toBe(false);
    expect(applyRuntimeModeFromLaunchQuery({ [RUNTIME_MODE_LAUNCH_QUERY_KEY]: "demo" }, storage))
      .toBe(false);
    expect(values.size).toBe(0);

    expect(applyRuntimeModeFromLaunchQuery({
      [RUNTIME_MODE_LAUNCH_QUERY_KEY]: "cloudbase_identity_test",
    }, storage)).toBe(true);
    expect(values.get(RUNTIME_MODE_STORAGE_KEY)).toBe("cloudbase_identity_test");
  });

  it("uses the api cloud function without putting identity in the payload", async () => {
    const call = vi.fn().mockResolvedValue({ result: { ok: true, data: { accessState: "invite_required" } } });
    const client = createCloudBaseApiClient(call);

    await expect(client.read("auth.status", {})).resolves.toEqual({ accessState: "invite_required" });
    expect(call).toHaveBeenCalledWith({ name: "api", data: { action: "auth.status", payload: {} } });
  });
});
