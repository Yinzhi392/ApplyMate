import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";
import { createPreferenceFacts } from "../../shared/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-1234-4234-a234-123456789abc`;
}

describe("user.updatePreferences", () => {
  it("adds, replaces, and clears preference text and derived facts", async () => {
    const repository = new InMemoryIdentityRepository();
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_admin" }),
    });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(1),
    });

    const originalText = "希望远程。可立即到岗\n每周 4 天";
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: originalText },
        requestId: requestId(2),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        preferenceText: originalText,
        preferenceFacts: createPreferenceFacts(originalText),
      },
    });

    const replacementText = "仅考虑上海线下岗位";
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: replacementText },
        requestId: requestId(3),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        preferenceText: replacementText,
        preferenceFacts: createPreferenceFacts(replacementText),
      },
    });

    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: " \n；。 " },
        requestId: requestId(4),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { preferenceText: "", preferenceFacts: [] },
    });
  });

  it("accepts 500 visible characters and rejects 501 without overwriting", async () => {
    const repository = new InMemoryIdentityRepository();
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_admin" }),
    });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(5),
    });
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: ` ${"字".repeat(500)} ` },
        requestId: requestId(6),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: "新".repeat(501) },
        requestId: requestId(7),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });

    await expect(api({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { user: { preferenceText: "字".repeat(500) } },
    });
  });
});
