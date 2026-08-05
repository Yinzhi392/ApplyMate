import { describe, expect, it } from "vitest";

import {
  IdempotencyService,
  InMemoryIdempotencyRepository,
} from "../../cloudfunctions/api/src/index.js";

const startedAt = new Date("2026-08-05T12:00:00.000Z");

describe("write idempotency service", () => {
  it("replays the original response for the same request and payload", async () => {
    const service = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    let executions = 0;
    const execute = () => {
      executions += 1;
      return Promise.resolve({
        ok: true as const,
        data: { execution: executions },
      });
    };

    const first = await service.execute(
      "identity_synthetic_a",
      "agreement.accept",
      "123e4567-e89b-42d3-a456-426614174000",
      { a: 1, nested: { z: true, b: "same" } },
      () => startedAt,
      execute,
    );
    const replay = await service.execute(
      "identity_synthetic_a",
      "agreement.accept",
      "123e4567-e89b-42d3-a456-426614174000",
      { nested: { b: "same", z: true }, a: 1 },
      () => new Date("2026-08-05T13:00:00.000Z"),
      execute,
    );

    expect(replay).toEqual(first);
    expect(executions).toBe(1);
  });

  it("rejects a reused request identifier with a different payload", async () => {
    const service = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    const requestId = "123e4567-e89b-42d3-a456-426614174000";
    const execute = () => Promise.resolve({ ok: true as const, data: {} });

    await service.execute(
      "identity_synthetic_a",
      "user.updatePreferences",
      requestId,
      { preferenceText: "希望远程" },
      () => startedAt,
      execute,
    );
    await expect(
      service.execute(
        "identity_synthetic_a",
        "user.updatePreferences",
        requestId,
        { preferenceText: "仅接受线下" },
        () => startedAt,
        execute,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cleans completed mappings only after the 24-hour boundary", async () => {
    const repository = new InMemoryIdempotencyRepository();
    const service = new IdempotencyService(repository);
    let executions = 0;
    const execute = () => {
      executions += 1;
      return Promise.resolve({ ok: true as const, data: { executions } });
    };
    const requestId = "123e4567-e89b-42d3-a456-426614174000";

    await service.execute(
      "identity_synthetic_a",
      "agreement.accept",
      requestId,
      {},
      () => startedAt,
      execute,
    );
    await expect(
      service.cleanupExpired(new Date("2026-08-06T11:59:59.999Z")),
    ).resolves.toBe(0);
    await expect(
      service.cleanupExpired(new Date("2026-08-06T12:00:00.000Z")),
    ).resolves.toBe(1);

    await service.execute(
      "identity_synthetic_a",
      "agreement.accept",
      requestId,
      {},
      () => new Date("2026-08-06T12:00:00.000Z"),
      execute,
    );
    expect(executions).toBe(2);
  });

  it("coalesces concurrent duplicates into one execution", async () => {
    const service = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    let executions = 0;
    let finish: ((value: { ok: true; data: { done: boolean } }) => void) | undefined;
    const execute = () => {
      executions += 1;
      return new Promise<{ ok: true; data: { done: boolean } }>((resolve) => {
        finish = resolve;
      });
    };
    const args = [
      "identity_synthetic_a",
      "agreement.accept",
      "123e4567-e89b-42d3-a456-426614174000",
      {},
      () => startedAt,
      execute,
    ] as const;

    const first = service.execute(...args);
    const second = service.execute(...args);
    await Promise.resolve();
    finish?.({ ok: true, data: { done: true } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, data: { done: true } },
      { ok: true, data: { done: true } },
    ]);
    expect(executions).toBe(1);
  });

  it("starts the 24-hour retention window when the operation completes", async () => {
    const service = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    let currentTime = new Date("2026-08-05T12:00:00.000Z");

    await service.execute(
      "identity_synthetic_a",
      "agreement.accept",
      "123e4567-e89b-42d3-a456-426614174000",
      {},
      () => currentTime,
      async () => {
        currentTime = new Date("2026-08-05T13:00:00.000Z");
        return { ok: true, data: {} };
      },
    );

    await expect(
      service.cleanupExpired(new Date("2026-08-06T12:00:00.000Z")),
    ).resolves.toBe(0);
    await expect(
      service.cleanupExpired(new Date("2026-08-06T13:00:00.000Z")),
    ).resolves.toBe(1);
  });
});
