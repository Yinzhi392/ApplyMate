export const DEFAULT_DAILY_AI_LIMIT = 5;

export type QuotaReservationStatus = "reserved" | "succeeded" | "released";

export interface DailyUsageRecord {
  userId: string;
  dateKey: string;
  reserved: number;
  succeeded: number;
  temporaryIncrease: number;
  updatedAt: string;
}

export interface QuotaReservationRecord {
  reservationId: string;
  userId: string;
  dateKey: string;
  status: QuotaReservationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuotaUsageView extends DailyUsageRecord {
  limit: number;
  remaining: number;
}

export interface QuotaAdjustmentAuditRecord {
  auditId: string;
  action: "admin.quotaAdjust";
  actorUserId: string;
  targetUserId: string;
  dateKey: string;
  increase: number;
  reason: string;
  createdAt: string;
}

export interface QuotaAdminStats {
  users: number;
  reserved: number;
  succeeded: number;
  temporaryIncrease: number;
  auditEvents: number;
}

export function getDailyQuotaLimit(temporaryIncrease: number): number {
  if (!Number.isSafeInteger(temporaryIncrease) || temporaryIncrease < 0) {
    throw new RangeError("Temporary quota increase must be non-negative.");
  }
  return DEFAULT_DAILY_AI_LIMIT + temporaryIncrease;
}
import { getBeijingDateKey } from "../../../shared/src/index.js";

export { getBeijingDateKey };
