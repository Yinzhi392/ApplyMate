import { describe, expect, it } from "vitest";

import {
  InMemoryQuotaRepository,
  QuotaService,
} from "../../cloudfunctions/api/src/index.js";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("daily quota reservations", () => {
  it("allows at most five of six concurrent reservations", async () => {
    const service = new QuotaService(new InMemoryQuotaRepository());

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        service.reserve(
          "user_synthetic_a",
          `reservation_synthetic_${index + 1}`,
          now,
        ),
      ),
    );

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(5);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      results.find(({ status }) => status === "rejected"),
    ).toMatchObject({ reason: { code: "LIMIT_EXCEEDED" } });
    await expect(service.getUsage("user_synthetic_a", now)).resolves.toMatchObject({
      reserved: 5,
      succeeded: 0,
      limit: 5,
      remaining: 0,
    });
  });

  it("moves a reservation to success once and releases failures once", async () => {
    const service = new QuotaService(new InMemoryQuotaRepository());
    await service.reserve("user_synthetic_a", "reservation_success", now);
    await service.succeed("reservation_success", now);
    await service.succeed("reservation_success", now);

    await service.reserve("user_synthetic_a", "reservation_failure", now);
    await service.release("reservation_failure", now);
    await service.release("reservation_failure", now);

    await expect(service.getUsage("user_synthetic_a", now)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 1,
      limit: 5,
      remaining: 4,
    });
  });

  it("keeps a reservation on its original Beijing date when completed later", async () => {
    const service = new QuotaService(new InMemoryQuotaRepository());
    const beforeMidnight = new Date("2026-08-05T15:59:59.000Z");
    const afterMidnight = new Date("2026-08-05T16:00:01.000Z");

    await service.reserve(
      "user_synthetic_a",
      "reservation_cross_day",
      beforeMidnight,
    );
    await service.succeed("reservation_cross_day", afterMidnight);

    await expect(
      service.getUsage("user_synthetic_a", beforeMidnight),
    ).resolves.toMatchObject({ succeeded: 1, reserved: 0 });
    await expect(
      service.getUsage("user_synthetic_a", afterMidnight),
    ).resolves.toMatchObject({ succeeded: 0, reserved: 0, remaining: 5 });
  });
});
