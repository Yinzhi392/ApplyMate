import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  InviteService,
  UserService,
  hashInviteCode,
} from "../../cloudfunctions/api/src/index.js";

const createdAt = new Date("2026-08-05T12:00:00.000Z");

describe("single-use invitation service", () => {
  it("stores only a hash and defaults to seven-day expiry", async () => {
    const repository = new InMemoryIdentityRepository();
    const service = new InviteService(repository);

    const invite = await service.createInvite(
      "user_synthetic_admin",
      "AM-TEST-0001",
      createdAt,
    );
    const stored = await repository.getInviteByHash(
      hashInviteCode("AM-TEST-0001"),
    );

    expect(invite.expiresAt).toBe("2026-08-12T12:00:00.000Z");
    expect(stored).toEqual(invite);
    expect(JSON.stringify(stored)).not.toContain("AM-TEST-0001");
  });

  it("allows exactly one concurrent activation", async () => {
    const repository = new InMemoryIdentityRepository();
    const users = new UserService(repository);
    const service = new InviteService(repository);
    const first = await users.getOrCreateUser("wx_synthetic_user_a", createdAt);
    const second = await users.getOrCreateUser("wx_synthetic_user_b", createdAt);
    await service.createInvite("user_synthetic_admin", "AM-TEST-0001", createdAt);

    const results = await Promise.allSettled([
      service.activateInvite(first, "AM-TEST-0001", createdAt),
      service.activateInvite(second, "AM-TEST-0001", createdAt),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const savedUsers = await Promise.all([
      repository.getUserById(first.userId),
      repository.getUserById(second.userId),
    ]);
    expect(
      savedUsers.filter((user) => user?.activationStatus === "active"),
    ).toHaveLength(1);
  });

  it("rejects expired, revoked, and already-used invitations", async () => {
    const repository = new InMemoryIdentityRepository();
    const users = new UserService(repository);
    const service = new InviteService(repository);
    const user = await users.getOrCreateUser("wx_synthetic_user_a", createdAt);

    await service.createInvite("user_synthetic_admin", "AM-EXPIRED-1", createdAt);
    await expect(
      service.activateInvite(
        user,
        "AM-EXPIRED-1",
        new Date("2026-08-12T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    const revoked = await service.createInvite(
      "user_synthetic_admin",
      "AM-REVOKED-1",
      createdAt,
    );
    await repository.revokeInvite(revoked.inviteId, createdAt);
    await expect(
      service.activateInvite(user, "AM-REVOKED-1", createdAt),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await service.createInvite("user_synthetic_admin", "AM-USED-0001", createdAt);
    await service.activateInvite(user, "AM-USED-0001", createdAt);
    await expect(
      service.activateInvite(user, "AM-USED-0001", createdAt),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
