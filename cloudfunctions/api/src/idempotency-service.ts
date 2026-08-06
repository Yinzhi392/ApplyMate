import { createHash } from "node:crypto";

import type {
  ApiAction,
  ApiResponse,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type { IdempotencyRecord } from "./idempotency-domain.js";
import type { IdempotencyRepository } from "./idempotency-repository.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashIdempotencyPayload(payload: Record<string, unknown>): string {
  return hashValue(JSON.stringify(canonicalize(payload)));
}

export function createIdempotencyKeyHash(
  callerKey: string,
  action: ApiAction,
  requestId: string,
): string {
  return hashValue(
    `applymate-idempotency-v1\0${callerKey}\0${action}\0${requestId}`,
  );
}

export function hashIdempotencyCallerKey(callerKey: string): string {
  return hashValue(`applymate-idempotency-caller-v1\0${callerKey}`);
}

export class IdempotencyService {
  readonly #inFlight = new Map<string, Promise<ApiResponse>>();

  constructor(private readonly repository: IdempotencyRepository) {}

  async execute(
    callerKey: string,
    action: ApiAction,
    requestId: string,
    payload: Record<string, unknown>,
    clock: () => Date,
    operation: () => Promise<ApiResponse>,
  ): Promise<ApiResponse> {
    const startedAt = clock();
    const keyHash = createIdempotencyKeyHash(callerKey, action, requestId);
    const payloadHash = hashIdempotencyPayload(payload);
    const candidate: IdempotencyRecord = {
      keyHash,
      callerKeyHash: hashIdempotencyCallerKey(callerKey),
      action,
      requestId,
      payloadHash,
      status: "pending",
      createdAt: startedAt.toISOString(),
    };
    const claim = await this.repository.claim(candidate, startedAt);
    if (claim.kind === "conflict") {
      throw new DomainError(
        "CONFLICT",
        "Request identifier was reused with different input.",
      );
    }
    if (claim.kind === "replay") {
      return claim.response;
    }
    if (claim.kind === "pending") {
      const active = this.#inFlight.get(keyHash);
      if (active !== undefined) {
        return active;
      }
      throw new DomainError(
        "CONFLICT",
        "The same request is still being processed.",
        true,
      );
    }

    const active = (async () => {
      try {
        const response = await operation();
        await this.repository.complete(keyHash, payloadHash, response, clock());
        return response;
      } catch (error) {
        await this.repository.abandon(keyHash, payloadHash);
        throw error;
      }
    })();
    this.#inFlight.set(keyHash, active);
    try {
      return await active;
    } finally {
      if (this.#inFlight.get(keyHash) === active) {
        this.#inFlight.delete(keyHash);
      }
    }
  }

  cleanupExpired(now: Date): Promise<number> {
    return this.repository.cleanupExpired(now);
  }
}
