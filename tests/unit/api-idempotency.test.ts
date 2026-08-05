import { describe, expect, it } from "vitest";

import {
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  createIdentityAccessApi,
  hashTrustedOpenId,
} from "../../cloudfunctions/api/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

describe("API write idempotency", () => {
  it("replays one write and conflicts on a changed payload", async () => {
    const repository = new InMemoryIdentityRepository();
    const idempotency = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    let now = new Date("2026-08-05T12:00:00.000Z");
    const api = createIdentityAccessApi({
      repository,
      idempotency,
      currentVersions,
      adminOpenIds: [],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_user" }),
    });
    const request = {
      action: "agreement.accept" as const,
      payload: currentVersions,
      requestId: "123e4567-e89b-42d3-a456-426614174000",
    };

    const first = await api(request);
    now = new Date("2026-08-05T13:00:00.000Z");
    const replay = await api(request);
    const user = await repository.getUserByIdentityHash(
      hashTrustedOpenId("wx_synthetic_user"),
    );

    expect(replay).toEqual(first);
    expect(user?.agreements.userAgreement?.acceptedAt).toBe(
      "2026-08-05T12:00:00.000Z",
    );
    await expect(
      api({
        ...request,
        payload: {
          ...currentVersions,
          privacyPolicyVersion: "privacy-changed",
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });
});
