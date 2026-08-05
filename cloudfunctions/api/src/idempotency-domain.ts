import type { ApiAction, ApiResponse } from "../../../shared/src/index.js";

export type IdempotencyStatus = "pending" | "completed";

export interface IdempotencyRecord {
  keyHash: string;
  action: ApiAction;
  requestId: string;
  payloadHash: string;
  status: IdempotencyStatus;
  response?: ApiResponse;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

export type IdempotencyClaimResult =
  | { kind: "claimed"; record: IdempotencyRecord }
  | { kind: "pending"; record: IdempotencyRecord }
  | { kind: "replay"; response: ApiResponse }
  | { kind: "conflict" };
