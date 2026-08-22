import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  InMemoryQuotaRepository,
  QuotaService,
  ResourceGateService,
  createIdentityAccessApi,
  hashTrustedOpenId,
} from "../../cloudfunctions/api/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

const requestId = "123e4567-e89b-42d3-a456-426614174000";

describe("auth.status and user.get", () => {
  it("moves a normal user from agreement-required to invite-required", async () => {
    const repository = new InMemoryIdentityRepository();
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: [],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_user_a" }),
    });

    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "agreement_required", isAdmin: false },
    });
    await expect(
      api({
        action: "agreement.accept",
        payload: currentVersions,
        requestId,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "invite_required", isAdmin: false },
    });
    expect(repository.userCount).toBe(1);
  });

  it("reports active, admin, disabled, and stale-agreement states", async () => {
    const repository = new InMemoryIdentityRepository();
    let openId = "wx_synthetic_admin";
    const dependencies = {
      repository,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: openId }),
    };
    const api = createIdentityAccessApi(dependencies);

    await api({ action: "auth.status", payload: {} });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId,
    });
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active", isAdmin: true },
    });

    openId = "wx_synthetic_active";
    await api({ action: "auth.status", payload: {} });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: "223e4567-e89b-42d3-a456-426614174000",
    });
    const active = await repository.getUserByIdentityHash(hashTrustedOpenId(openId));
    await repository.saveUser({ ...active!, activationStatus: "active" });
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active", isAdmin: false },
    });

    await repository.saveUser({ ...active!, accountStatus: "disabled" });
    await expect(api({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "disabled" },
    });

    openId = "wx_synthetic_admin";
    const changedApi = createIdentityAccessApi({
      ...dependencies,
      currentVersions: {
        ...currentVersions,
        privacyPolicyVersion: "privacy-2026-09",
      },
    });
    await expect(changedApi({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "agreement_required", isAdmin: true },
    });
  });

  it("returns only the current user's safe profile", async () => {
    const repository = new InMemoryIdentityRepository();
    const api = createIdentityAccessApi({
      repository,
      currentVersions,
      adminOpenIds: [],
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_user_a" }),
    });

    const response = await api({
      action: "user.get",
      payload: { userId: "user_someone_else" },
    });

    expect(response).toMatchObject({
      ok: true,
      data: {
        user: { accountStatus: "enabled", activationStatus: "pending_invite" },
      },
    });
    expect(JSON.stringify(response)).not.toContain("identityHash");
    expect(JSON.stringify(response)).not.toContain("wx_synthetic_user_a");
  });

  it("returns the current daily quota and free-resource pause state for the client", async () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const quotas = new QuotaService(new InMemoryQuotaRepository());
    const resourceGate = new ResourceGateService({
      ocr: true,
      model: false,
      compute_storage: true,
    });
    const api = createIdentityAccessApi({
      repository: new InMemoryIdentityRepository(),
      quotas,
      resourceGate: {
        service: resourceGate,
        resolveRequirements: () => [],
      },
      currentVersions,
      adminOpenIds: [],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_quota_user" }),
    });
    const userResponse = await api({ action: "user.get", payload: {} });
    const userId = (userResponse as { data?: { user?: { userId?: string } } }).data?.user?.userId ?? "";
    await quotas.reserve(userId, "quota_identity_status", now);

    await expect(api({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: {
        user: {
          remainingQuota: 19,
          resourcePauseReason: "模型免费额度已暂停",
        },
      },
    });
  });
});
