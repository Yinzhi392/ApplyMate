import { describe, expect, it } from "vitest";

import {
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  createIdentityAccessApi,
  hashTrustedOpenId,
} from "../../cloudfunctions/api/src/index.js";

const VERSIONS = {
  userAgreementVersion: "user-2026-08-09",
  privacyPolicyVersion: "privacy-2026-08-09",
};

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-6789-4234-a234-123456789abc`;
}

describe("invitation activation rate limit", () => {
  it("counts unique failures, locks after five failures for 15 minutes, and uses one generic message", async () => {
    const repository = new InMemoryIdentityRepository();
    let now = new Date("2026-08-09T02:00:00.000Z");
    const api = createIdentityAccessApi({
      repository,
      idempotency: new IdempotencyService(new InMemoryIdempotencyRepository()),
      currentVersions: VERSIONS,
      adminOpenIds: [],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_invite_rate_limit" }),
    });
    await api({
      action: "agreement.accept",
      payload: VERSIONS,
      requestId: requestId(1),
    });

    const firstFailure = {
      action: "invite.activate" as const,
      payload: { code: "BAD-CODE-01" },
      requestId: requestId(2),
    };
    const first = await api(firstFailure);
    expect(await api(firstFailure)).toEqual(first);
    for (let index = 3; index <= 6; index += 1) {
      await expect(
        api({
          action: "invite.activate",
          payload: { code: `BAD-CODE-0${index}` },
          requestId: requestId(index),
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          message: "Invitation is invalid or unavailable.",
        },
      });
    }
    const locked = await api({
      action: "invite.activate",
      payload: { code: "BAD-CODE-07" },
      requestId: requestId(7),
    });
    expect(locked).toMatchObject({
      ok: false,
      error: {
        code: "LIMIT_EXCEEDED",
        message: "Invitation is invalid or unavailable.",
      },
    });
    const user = await repository.getUserByIdentityHash(
      hashTrustedOpenId("wx_invite_rate_limit"),
    );
    expect(user?.inviteAttemptState?.failureTimestamps).toHaveLength(5);
    expect(user?.inviteAttemptState?.lockedUntil).toBe(
      "2026-08-09T02:15:00.000Z",
    );

    now = new Date("2026-08-09T02:15:00.001Z");
    await expect(
      api({
        action: "invite.activate",
        payload: { code: "BAD-CODE-08" },
        requestId: requestId(8),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    const reset = await repository.getUserByIdentityHash(
      hashTrustedOpenId("wx_invite_rate_limit"),
    );
    expect(reset?.inviteAttemptState?.failureTimestamps).toHaveLength(1);
  });
});
