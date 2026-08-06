import type { ApiResponse } from "../../../shared/src/index.js";

import type {
  IdempotencyClaimResult,
  IdempotencyRecord,
} from "./idempotency-domain.js";
import { hashIdempotencyCallerKey } from "./idempotency-service.js";

export interface IdempotencyRepository {
  claim(
    candidate: IdempotencyRecord,
    now: Date,
  ): Promise<IdempotencyClaimResult>;
  complete(
    keyHash: string,
    payloadHash: string,
    response: ApiResponse,
    now: Date,
  ): Promise<void>;
  abandon(keyHash: string, payloadHash: string): Promise<void>;
  cleanupExpired(now: Date): Promise<number>;
  deleteForCallerKey(callerKey: string): Promise<number>;
}

function cloneRecord(record: IdempotencyRecord): IdempotencyRecord {
  return structuredClone(record);
}

export class InMemoryIdempotencyRepository
  implements IdempotencyRepository
{
  readonly #records = new Map<string, IdempotencyRecord>();

  async claim(
    candidate: IdempotencyRecord,
    now: Date,
  ): Promise<IdempotencyClaimResult> {
    const existing = this.#records.get(candidate.keyHash);
    if (
      existing?.status === "completed" &&
      existing.expiresAt !== undefined &&
      new Date(existing.expiresAt).getTime() <= now.getTime()
    ) {
      this.#records.delete(candidate.keyHash);
    } else if (existing !== undefined) {
      if (existing.payloadHash !== candidate.payloadHash) {
        return { kind: "conflict" };
      }
      if (existing.status === "completed" && existing.response !== undefined) {
        return { kind: "replay", response: structuredClone(existing.response) };
      }
      return { kind: "pending", record: cloneRecord(existing) };
    }

    this.#records.set(candidate.keyHash, cloneRecord(candidate));
    return { kind: "claimed", record: cloneRecord(candidate) };
  }

  async complete(
    keyHash: string,
    payloadHash: string,
    response: ApiResponse,
    now: Date,
  ): Promise<void> {
    const record = this.#records.get(keyHash);
    if (
      record === undefined ||
      record.status !== "pending" ||
      record.payloadHash !== payloadHash
    ) {
      throw new Error("Idempotency claim is not pending.");
    }

    const completedAt = now.toISOString();
    this.#records.set(keyHash, {
      ...record,
      status: "completed",
      response: structuredClone(response),
      completedAt,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    });
  }

  async abandon(keyHash: string, payloadHash: string): Promise<void> {
    const record = this.#records.get(keyHash);
    if (
      record?.status === "pending" &&
      record.payloadHash === payloadHash
    ) {
      this.#records.delete(keyHash);
    }
  }

  async cleanupExpired(now: Date): Promise<number> {
    let removed = 0;
    for (const [keyHash, record] of this.#records) {
      if (
        record.status === "completed" &&
        record.expiresAt !== undefined &&
        new Date(record.expiresAt).getTime() <= now.getTime()
      ) {
        this.#records.delete(keyHash);
        removed += 1;
      }
    }
    return removed;
  }

  async deleteForCallerKey(callerKey: string): Promise<number> {
    const callerKeyHash = hashIdempotencyCallerKey(callerKey);
    let deleted = 0;
    for (const [keyHash, record] of this.#records) {
      if (record.callerKeyHash === callerKeyHash && this.#records.delete(keyHash)) {
        deleted += 1;
      }
    }
    return deleted;
  }
}
