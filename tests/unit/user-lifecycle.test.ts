import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  UserService,
  canDisabledUserAccessAction,
} from "../../cloudfunctions/api/src/index.js";

describe("user lifecycle", () => {
  it("creates one user on first access and reuses it thereafter", async () => {
    const repository = new InMemoryIdentityRepository();
    const service = new UserService(repository);
    const now = new Date("2026-08-05T12:00:00.000Z");

    const [first, second] = await Promise.all([
      service.getOrCreateUser("wx_synthetic_user_a", now),
      service.getOrCreateUser("wx_synthetic_user_a", now),
    ]);

    expect(second).toEqual(first);
    expect(repository.userCount).toBe(1);
    expect(first.accountStatus).toBe("enabled");
    expect(first.activationStatus).toBe("pending_invite");
    expect(JSON.stringify(first)).not.toContain("wx_synthetic_user_a");
  });

  it("creates different isolated records for different trusted identities", async () => {
    const repository = new InMemoryIdentityRepository();
    const service = new UserService(repository);
    const now = new Date("2026-08-05T12:00:00.000Z");

    const first = await service.getOrCreateUser("wx_synthetic_user_a", now);
    const second = await service.getOrCreateUser("wx_synthetic_user_b", now);

    expect(first.userId).not.toBe(second.userId);
    expect(first.identityHash).not.toBe(second.identityHash);
    expect(repository.userCount).toBe(2);
  });

  it("limits disabled accounts to status and deletion-flow actions", () => {
    expect(canDisabledUserAccessAction("auth.status")).toBe(true);
    expect(canDisabledUserAccessAction("user.get")).toBe(true);
    expect(canDisabledUserAccessAction("user.delete")).toBe(true);
    expect(canDisabledUserAccessAction("user.updatePreferences")).toBe(false);
    expect(canDisabledUserAccessAction("invite.activate")).toBe(false);
    expect(canDisabledUserAccessAction("admin.userSetEnabled")).toBe(false);
  });
});
