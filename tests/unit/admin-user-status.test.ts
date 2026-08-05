import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

const ids = {
  acceptUser: "123e4567-e89b-42d3-a456-426614174000",
  forgedDisable: "223e4567-e89b-42d3-a456-426614174000",
  acceptAdmin: "323e4567-e89b-42d3-a456-426614174000",
  actualDisable: "423e4567-e89b-42d3-a456-426614174000",
};

describe("admin.userSetEnabled", () => {
  it("denies normal and forged administrators, but persists an audited admin change", async () => {
    const repository = new InMemoryIdentityRepository();
    let openId = "wx_synthetic_user";
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: ids.acceptUser,
    });
    const userResponse = await api({ action: "user.get", payload: {} });
    const targetUserId =
      userResponse.ok &&
      typeof userResponse.data === "object" &&
      userResponse.data !== null
        ? Reflect.get(Reflect.get(userResponse.data, "user"), "userId")
        : undefined;

    await expect(
      api({
        action: "admin.userSetEnabled",
        payload: {
          targetUserId,
          enabled: false,
          reason: "synthetic test",
          openId: "wx_synthetic_admin",
        },
        requestId: ids.forgedDisable,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    openId = "wx_synthetic_admin";
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: ids.acceptAdmin,
    });
    await expect(
      api({
        action: "admin.userSetEnabled",
        payload: {
          targetUserId,
          enabled: false,
          reason: "synthetic test",
        },
        requestId: ids.actualDisable,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { userId: targetUserId, accountStatus: "disabled" },
    });

    const auditRecords = repository.listAuditRecords();
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]).toMatchObject({
      action: "admin.userSetEnabled",
      actorUserId: expect.stringMatching(/^user_/u),
      targetUserId,
      enabled: false,
      reason: "synthetic test",
    });
    expect(JSON.stringify(auditRecords)).not.toContain("wx_synthetic");

    openId = "wx_synthetic_user";
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accountStatus: "disabled", accessState: "disabled" },
    });
    await expect(
      api({
        action: "user.updatePreferences",
        payload: { preferenceText: "希望远程" },
        requestId: "523e4567-e89b-42d3-a456-426614174000",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
