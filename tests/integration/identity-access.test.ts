import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-1234-4234-a234-123456789abc`;
}

type IdentityApiResponse = Awaited<
  ReturnType<ReturnType<typeof createIdentityAccessApi>>
>;

function readUserId(response: IdentityApiResponse): string {
  if (!response.ok || typeof response.data !== "object" || response.data === null) {
    throw new Error("Expected a successful user response.");
  }
  const user = Reflect.get(response.data, "user");
  const userId =
    typeof user === "object" && user !== null
      ? Reflect.get(user, "userId")
      : undefined;
  if (typeof userId !== "string") {
    throw new Error("Expected a user identifier.");
  }
  return userId;
}

describe("identity and invitation access integration", () => {
  it("isolates users across the complete local access lifecycle", async () => {
    const repository = new InMemoryIdentityRepository();
    let openId = "wx_synthetic_admin";
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      generateInviteCode: () => "AM-INTEGRATION-1",
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(1),
    });
    await api({
      action: "admin.inviteCreate",
      payload: {},
      requestId: requestId(2),
    });

    openId = "wx_synthetic_user_a";
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(3),
    });
    const userAId = readUserId(await api({ action: "user.get", payload: {} }));

    openId = "wx_synthetic_user_b";
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(4),
    });
    const userBId = readUserId(await api({ action: "user.get", payload: {} }));

    const [activationA, activationB] = await Promise.all([
      (async () => {
        openId = "wx_synthetic_user_a";
        return api({
          action: "invite.activate",
          payload: { code: "AM-INTEGRATION-1" },
          requestId: requestId(5),
        });
      })(),
      (async () => {
        openId = "wx_synthetic_user_b";
        return api({
          action: "invite.activate",
          payload: { code: "AM-INTEGRATION-1" },
          requestId: requestId(6),
        });
      })(),
    ]);
    expect([activationA, activationB].filter(({ ok }) => ok)).toHaveLength(1);

    const winnerOpenId = activationA.ok
      ? "wx_synthetic_user_a"
      : "wx_synthetic_user_b";
    const winnerUserId = activationA.ok ? userAId : userBId;
    const loserOpenId = activationA.ok
      ? "wx_synthetic_user_b"
      : "wx_synthetic_user_a";
    const loserUserId = activationA.ok ? userBId : userAId;

    openId = winnerOpenId;
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: "希望远程。可立即到岗" },
        requestId: requestId(7),
      }),
    ).resolves.toMatchObject({ ok: true });
    const winnerCrossRead = await api({
      action: "user.get",
      payload: { userId: loserUserId },
    });
    expect(readUserId(winnerCrossRead)).toBe(winnerUserId);

    openId = loserOpenId;
    const loserCrossRead = await api({
      action: "user.get",
      payload: { userId: winnerUserId },
    });
    expect(readUserId(loserCrossRead)).toBe(loserUserId);
    expect(loserCrossRead).toMatchObject({
      ok: true,
      data: { user: { preferenceText: "" } },
    });
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: "试图绕过邀请码" },
        requestId: requestId(8),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVITE_REQUIRED" },
    });

    openId = winnerOpenId;
    const changedAgreementApi = createIdentityAccessApi({
      repository,
      currentVersions: {
        ...currentVersions,
        privacyPolicyVersion: "privacy-2026-09",
      },
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: openId }),
    });
    await expect(
      changedAgreementApi({
        action: "user.updatePreferences",
        payload: { preferenceText: "旧协议不可写入" },
        requestId: requestId(9),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "AGREEMENT_REQUIRED" },
    });

    openId = "wx_synthetic_admin";
    await expect(
      api({
        action: "admin.userSetEnabled",
        payload: {
          targetUserId: winnerUserId,
          enabled: false,
          reason: "integration test",
        },
        requestId: requestId(10),
      }),
    ).resolves.toMatchObject({ ok: true });

    openId = winnerOpenId;
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "disabled" },
    });
  });
});
