import { describe, expect, it } from "vitest";

import {
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const VERSIONS = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-5678-4234-a234-123456789abc`;
}

function readString(response: unknown, field: string): string {
  if (
    typeof response !== "object" ||
    response === null ||
    Reflect.get(response, "ok") !== true
  ) {
    throw new Error("Expected a successful API response.");
  }
  const data = Reflect.get(response, "data");
  const value =
    typeof data === "object" && data !== null
      ? Reflect.get(data, field)
      : undefined;
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} in API response.`);
  }
  return value;
}

describe("account deletion confirmation", () => {
  it("requires a live second-confirmation token, disables immediately, and cannot be reversed", async () => {
    const repository = new InMemoryIdentityRepository();
    let openId = "wx_delete_owner";
    let now = new Date("2026-08-06T01:00:00.000Z");
    let generatedToken = "synthetic-delete-token-1";
    const api = createIdentityAccessApi({
      repository,
      idempotency: new IdempotencyService(
        new InMemoryIdempotencyRepository(),
      ),
      currentVersions: VERSIONS,
      adminOpenIds: ["wx_delete_owner", "wx_delete_admin"],
      now: () => now,
      generateDeletionToken: () => generatedToken,
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await api({
      action: "agreement.accept",
      payload: VERSIONS,
      requestId: requestId(1),
    });
    const owner = await api({ action: "user.get", payload: {} });
    const ownerData = owner.ok ? owner.data : undefined;
    const ownerUser =
      typeof ownerData === "object" && ownerData !== null
        ? Reflect.get(ownerData, "user")
        : undefined;
    const ownerUserId =
      typeof ownerUser === "object" && ownerUser !== null
        ? Reflect.get(ownerUser, "userId")
        : undefined;
    expect(ownerUserId).toEqual(expect.any(String));

    await expect(
      api({
        action: "user.delete",
        payload: {
          operation: "confirm",
          confirmationToken: "not-issued-token-0001",
        },
        requestId: requestId(2),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const firstRequest = await api({
      action: "user.delete",
      payload: { operation: "request" },
      requestId: requestId(3),
    });
    expect(firstRequest).toMatchObject({
      ok: true,
      data: {
        confirmationRequired: true,
        expiresAt: "2026-08-06T01:10:00.000Z",
      },
    });

    now = new Date("2026-08-06T01:10:00.000Z");
    await expect(
      api({
        action: "user.delete",
        payload: {
          operation: "confirm",
          confirmationToken: readString(firstRequest, "confirmationToken"),
        },
        requestId: requestId(4),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accountStatus: "enabled" },
    });

    generatedToken = "synthetic-delete-token-2";
    const secondRequest = await api({
      action: "user.delete",
      payload: { operation: "request" },
      requestId: requestId(5),
    });
    now = new Date("2026-08-06T01:11:00.000Z");
    const confirmation = {
      action: "user.delete" as const,
      payload: {
        operation: "confirm",
        confirmationToken: readString(secondRequest, "confirmationToken"),
      },
      requestId: requestId(6),
    };
    const confirmed = await api(confirmation);
    const replay = await api(confirmation);
    expect(replay).toEqual(confirmed);
    expect(confirmed).toMatchObject({
      ok: true,
      data: {
        deletionStatus: "pending",
        accountStatus: "disabled",
        deletionDeadlineAt: "2026-08-07T01:11:00.000Z",
      },
    });
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: "不可恢复业务操作" },
        requestId: requestId(7),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    openId = "wx_delete_admin";
    await api({
      action: "agreement.accept",
      payload: VERSIONS,
      requestId: requestId(8),
    });
    await expect(
      api({
        action: "admin.userSetEnabled",
        payload: {
          targetUserId: ownerUserId,
          enabled: true,
          reason: "must not reverse confirmed deletion",
        },
        requestId: requestId(9),
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
