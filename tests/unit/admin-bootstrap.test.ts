import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

const requestIds = {
  acceptAdmin: "123e4567-e89b-42d3-a456-426614174000",
  createInvite: "223e4567-e89b-42d3-a456-426614174000",
  acceptUser: "323e4567-e89b-42d3-a456-426614174000",
  activateUser: "423e4567-e89b-42d3-a456-426614174000",
  forgedAdmin: "523e4567-e89b-42d3-a456-426614174000",
  revokeInvite: "623e4567-e89b-42d3-a456-426614174000",
};

describe("administrator invitation bootstrap", () => {
  it("requires agreements before a whitelisted administrator creates an invite", async () => {
    const repository = new InMemoryIdentityRepository();
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      generateInviteCode: () => "AM-BOOT-0001",
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_admin" }),
    });

    await expect(
      api({
        action: "admin.inviteCreate",
        payload: {},
        requestId: requestIds.createInvite,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "AGREEMENT_REQUIRED" },
    });

    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestIds.acceptAdmin,
    });
    await expect(
      api({
        action: "admin.inviteCreate",
        payload: {},
        requestId: requestIds.createInvite,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        code: "AM-BOOT-0001",
        expiresAt: "2026-08-12T12:00:00.000Z",
      },
    });
  });

  it("lets an agreed normal user activate once and denies forged admin identity", async () => {
    const repository = new InMemoryIdentityRepository();
    let openId = "wx_synthetic_admin";
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      generateInviteCode: () => "AM-BOOT-0001",
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestIds.acceptAdmin,
    });
    await api({
      action: "admin.inviteCreate",
      payload: {},
      requestId: requestIds.createInvite,
    });

    openId = "wx_synthetic_user";
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestIds.acceptUser,
    });
    await expect(
      api({
        action: "admin.inviteCreate",
        payload: { openId: "wx_synthetic_admin" },
        requestId: requestIds.forgedAdmin,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    await expect(
      api({
        action: "invite.activate",
        payload: { code: "AM-BOOT-0001" },
        requestId: requestIds.activateUser,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active" },
    });
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active", isAdmin: false },
    });
  });

  it("lets only an agreed administrator revoke an active invitation", async () => {
    const repository = new InMemoryIdentityRepository();
    let openId = "wx_synthetic_admin";
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      generateInviteCode: () => "AM-REVOKE-01",
      readCloudBaseContext: () => ({ OPENID: openId }),
    });

    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestIds.acceptAdmin,
    });
    const created = await api({
      action: "admin.inviteCreate",
      payload: {},
      requestId: requestIds.createInvite,
    });
    const inviteId =
      created.ok && typeof created.data === "object" && created.data !== null
        ? Reflect.get(created.data, "inviteId")
        : undefined;

    await expect(
      api({
        action: "admin.inviteRevoke",
        payload: { inviteId },
        requestId: requestIds.revokeInvite,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "revoked" },
    });

    openId = "wx_synthetic_user";
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestIds.acceptUser,
    });
    await expect(
      api({
        action: "invite.activate",
        payload: { code: "AM-REVOKE-01" },
        requestId: requestIds.activateUser,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });
});
