import { DomainError } from "./domain-error.js";
import {
  getBeijingDateKey,
  getDailyQuotaLimit,
  type DailyUsageRecord,
  type QuotaReservationRecord,
  type QuotaUsageView,
} from "./quota-domain.js";
import type { QuotaRepository } from "./quota-repository.js";

function emptyUsage(userId: string, dateKey: string, now: Date): DailyUsageRecord {
  return {
    userId,
    dateKey,
    reserved: 0,
    succeeded: 0,
    temporaryIncrease: 0,
    updatedAt: now.toISOString(),
  };
}

function toUsageView(usage: DailyUsageRecord): QuotaUsageView {
  const limit = getDailyQuotaLimit(usage.temporaryIncrease);
  return {
    ...usage,
    limit,
    remaining: Math.max(0, limit - usage.reserved - usage.succeeded),
  };
}

export class QuotaService {
  constructor(private readonly repository: QuotaRepository) {}

  async reserve(
    userId: string,
    reservationId: string,
    now: Date,
  ): Promise<QuotaReservationRecord> {
    const timestamp = now.toISOString();
    const reservation = await this.repository.reserve({
      reservationId,
      userId,
      dateKey: getBeijingDateKey(now),
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (reservation === null) {
      throw new DomainError("LIMIT_EXCEEDED", "Daily AI quota is exhausted.");
    }
    return reservation;
  }

  async succeed(reservationId: string, now: Date): Promise<QuotaUsageView> {
    return this.settle(reservationId, "succeeded", now);
  }

  async release(reservationId: string, now: Date): Promise<QuotaUsageView> {
    return this.settle(reservationId, "released", now);
  }

  async getUsage(userId: string, now: Date): Promise<QuotaUsageView> {
    const dateKey = getBeijingDateKey(now);
    const usage =
      (await this.repository.getUsage(userId, dateKey)) ??
      emptyUsage(userId, dateKey, now);
    return toUsageView(usage);
  }

  async increaseTemporaryQuota(
    actorUserId: string,
    targetUserId: string,
    increase: number,
    reason: string,
    requestId: string,
    now: Date,
  ): Promise<QuotaUsageView> {
    if (!Number.isSafeInteger(increase) || increase <= 0 || reason.trim() === "") {
      throw new DomainError("INVALID_REQUEST", "Quota adjustment is invalid.");
    }
    const dateKey = getBeijingDateKey(now);
    const usage = await this.repository.increaseTemporaryQuota(
      targetUserId,
      dateKey,
      increase,
      {
        auditId: `audit_${requestId}`,
        action: "admin.quotaAdjust",
        actorUserId,
        targetUserId,
        dateKey,
        increase,
        reason: reason.trim(),
        createdAt: now.toISOString(),
      },
      now,
    );
    return toUsageView(usage);
  }

  private async settle(
    reservationId: string,
    status: "succeeded" | "released",
    now: Date,
  ): Promise<QuotaUsageView> {
    const usage = await this.repository.settle(reservationId, status, now);
    if (usage === null) {
      throw new DomainError("NOT_FOUND", "Quota reservation was not found.");
    }
    return toUsageView(usage);
  }
}
