import { describe, expect, it } from "vitest";

import {
  AgreementService,
  InMemoryIdentityRepository,
  UserService,
} from "../../cloudfunctions/api/src/index.js";

const versions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

describe("agreement version records", () => {
  it("distinguishes missing, stale, and current agreement versions", async () => {
    const repository = new InMemoryIdentityRepository();
    const users = new UserService(repository);
    const agreements = new AgreementService(repository, versions);
    const user = await users.getOrCreateUser(
      "wx_synthetic_user_a",
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(agreements.hasCurrentAgreements(user)).toBe(false);
    await agreements.acceptAgreements(
      user,
      versions,
      new Date("2026-08-05T12:05:00.000Z"),
    );
    const current = await repository.getUserById(user.userId);
    expect(current).not.toBeNull();
    expect(agreements.hasCurrentAgreements(current!)).toBe(true);

    const changed = new AgreementService(repository, {
      ...versions,
      privacyPolicyVersion: "privacy-2026-09",
    });
    expect(changed.hasCurrentAgreements(current!)).toBe(false);
  });

  it("stores both accepted versions and one acceptance timestamp", async () => {
    const repository = new InMemoryIdentityRepository();
    const users = new UserService(repository);
    const agreements = new AgreementService(repository, versions);
    const user = await users.getOrCreateUser(
      "wx_synthetic_user_a",
      new Date("2026-08-05T12:00:00.000Z"),
    );

    await agreements.acceptAgreements(
      user,
      versions,
      new Date("2026-08-05T12:05:00.000Z"),
    );
    const saved = await repository.getUserById(user.userId);

    expect(saved?.agreements).toEqual({
      userAgreement: {
        version: "user-2026-08",
        acceptedAt: "2026-08-05T12:05:00.000Z",
      },
      privacyPolicy: {
        version: "privacy-2026-08",
        acceptedAt: "2026-08-05T12:05:00.000Z",
      },
    });
  });

  it("rejects an attempt to accept stale or invented versions", async () => {
    const repository = new InMemoryIdentityRepository();
    const users = new UserService(repository);
    const agreements = new AgreementService(repository, versions);
    const user = await users.getOrCreateUser(
      "wx_synthetic_user_a",
      new Date("2026-08-05T12:00:00.000Z"),
    );

    await expect(
      agreements.acceptAgreements(
        user,
        { ...versions, privacyPolicyVersion: "privacy-old" },
        new Date("2026-08-05T12:05:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("blocks business actions until current versions are accepted", async () => {
    const repository = new InMemoryIdentityRepository();
    const users = new UserService(repository);
    const agreements = new AgreementService(repository, versions);
    const user = await users.getOrCreateUser(
      "wx_synthetic_user_a",
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(() =>
      agreements.assertActionAgreement(user, "user.updatePreferences"),
    ).toThrowError(expect.objectContaining({ code: "AGREEMENT_REQUIRED" }));
    expect(() => agreements.assertActionAgreement(user, "auth.status")).not.toThrow();
    expect(() => agreements.assertActionAgreement(user, "agreement.accept")).not.toThrow();

    const accepted = await agreements.acceptAgreements(
      user,
      versions,
      new Date("2026-08-05T12:05:00.000Z"),
    );
    expect(() =>
      agreements.assertActionAgreement(accepted, "user.updatePreferences"),
    ).not.toThrow();
  });
});
