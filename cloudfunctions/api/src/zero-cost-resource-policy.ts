import { z } from "zod";

import {
  RESOURCE_KINDS,
  type ResourceKind,
} from "./operations-domain.js";
import type { ResourceAvailability } from "./resource-gate-service.js";

export const ZERO_COST_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export const ZeroCostResourceSnapshotSchema = z
  .object({
    resource: z.enum(RESOURCE_KINDS),
    status: z.enum(["available", "unavailable", "unknown"]),
    freeUnitsRemaining: z.number().nonnegative().finite(),
    requiredUnitsForNextAiJob: z.number().nonnegative().finite(),
    postpaidEnabled: z.boolean(),
    actualCostYuan: z.number().nonnegative().finite(),
    checkedAt: z.iso.datetime(),
  })
  .strict();

export type ZeroCostResourceSnapshot = z.infer<
  typeof ZeroCostResourceSnapshotSchema
>;

export type ZeroCostPauseReason =
  | "RESOURCE_NOT_AVAILABLE"
  | "POSTPAID_ENABLED"
  | "ACTUAL_COST_NOT_ZERO"
  | "INSUFFICIENT_FREE_UNITS"
  | "SNAPSHOT_STALE_OR_FUTURE";

export interface ZeroCostResourceDecision {
  resource: ResourceKind;
  shouldPause: boolean;
  reasons: ZeroCostPauseReason[];
  freeUnitsRemaining: number;
  requiredUnitsForNextAiJob: number;
  checkedAt: string;
}

export interface ZeroCostChecklistResult {
  decisions: ZeroCostResourceDecision[];
  availability: ResourceAvailability;
}

function evaluateSnapshot(
  snapshot: ZeroCostResourceSnapshot,
  now: Date,
): ZeroCostResourceDecision {
  const checkedAtMs = new Date(snapshot.checkedAt).getTime();
  const ageMs = now.getTime() - checkedAtMs;
  const reasons: ZeroCostPauseReason[] = [];

  if (snapshot.status !== "available") {
    reasons.push("RESOURCE_NOT_AVAILABLE");
  }
  if (snapshot.postpaidEnabled) {
    reasons.push("POSTPAID_ENABLED");
  }
  if (snapshot.actualCostYuan !== 0) {
    reasons.push("ACTUAL_COST_NOT_ZERO");
  }
  if (
    snapshot.freeUnitsRemaining < snapshot.requiredUnitsForNextAiJob
  ) {
    reasons.push("INSUFFICIENT_FREE_UNITS");
  }
  if (
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs > ZERO_COST_SNAPSHOT_MAX_AGE_MS
  ) {
    reasons.push("SNAPSHOT_STALE_OR_FUTURE");
  }

  return {
    resource: snapshot.resource,
    shouldPause: reasons.length > 0,
    reasons,
    freeUnitsRemaining: snapshot.freeUnitsRemaining,
    requiredUnitsForNextAiJob: snapshot.requiredUnitsForNextAiJob,
    checkedAt: snapshot.checkedAt,
  };
}

export function evaluateZeroCostChecklist(
  input: readonly ZeroCostResourceSnapshot[],
  now: Date,
): ZeroCostChecklistResult {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Zero-cost checklist requires a valid current time.");
  }

  const snapshots = input.map((snapshot) =>
    ZeroCostResourceSnapshotSchema.parse(snapshot),
  );
  const byResource = new Map<ResourceKind, ZeroCostResourceSnapshot>();
  for (const snapshot of snapshots) {
    if (byResource.has(snapshot.resource)) {
      throw new Error(`Duplicate zero-cost resource: ${snapshot.resource}`);
    }
    byResource.set(snapshot.resource, snapshot);
  }
  for (const resource of RESOURCE_KINDS) {
    if (!byResource.has(resource)) {
      throw new Error(`Missing zero-cost resource: ${resource}`);
    }
  }
  if (byResource.size !== RESOURCE_KINDS.length) {
    throw new Error("Zero-cost checklist contains an unknown resource.");
  }

  const decisions = RESOURCE_KINDS.map((resource) =>
    evaluateSnapshot(byResource.get(resource)!, now),
  );
  const isAvailable = (resource: ResourceKind) =>
    !decisions.find((decision) => decision.resource === resource)!.shouldPause;

  return {
    decisions,
    availability: {
      ocr: isAvailable("ocr"),
      model: isAvailable("model"),
      compute_storage:
        isAvailable("cloud_function") &&
        isAvailable("storage") &&
        isAvailable("traffic"),
    },
  };
}
