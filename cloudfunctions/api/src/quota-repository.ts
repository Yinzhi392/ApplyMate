import {
  getDailyQuotaLimit,
  type DailyUsageRecord,
  type QuotaAdjustmentAuditRecord,
  type QuotaReservationRecord,
  type QuotaReservationStatus,
} from "./quota-domain.js";

export interface QuotaRepository {
  reserve(
    candidate: QuotaReservationRecord,
  ): Promise<QuotaReservationRecord | null>;
  settle(
    reservationId: string,
    status: Exclude<QuotaReservationStatus, "reserved">,
    now: Date,
  ): Promise<DailyUsageRecord | null>;
  getUsage(userId: string, dateKey: string): Promise<DailyUsageRecord | null>;
  increaseTemporaryQuota(
    userId: string,
    dateKey: string,
    increase: number,
    audit: QuotaAdjustmentAuditRecord,
    now: Date,
  ): Promise<DailyUsageRecord>;
}

function usageKey(userId: string, dateKey: string): string {
  return `${userId}\0${dateKey}`;
}

function cloneUsage(usage: DailyUsageRecord): DailyUsageRecord {
  return structuredClone(usage);
}

function cloneReservation(
  reservation: QuotaReservationRecord,
): QuotaReservationRecord {
  return structuredClone(reservation);
}

function cloneAudit(
  audit: QuotaAdjustmentAuditRecord,
): QuotaAdjustmentAuditRecord {
  return structuredClone(audit);
}

export class InMemoryQuotaRepository implements QuotaRepository {
  readonly #usage = new Map<string, DailyUsageRecord>();
  readonly #reservations = new Map<string, QuotaReservationRecord>();
  readonly #auditRecords = new Map<string, QuotaAdjustmentAuditRecord>();

  listAuditRecords(): QuotaAdjustmentAuditRecord[] {
    return Array.from(this.#auditRecords.values(), cloneAudit);
  }

  async reserve(
    candidate: QuotaReservationRecord,
  ): Promise<QuotaReservationRecord | null> {
    const existing = this.#reservations.get(candidate.reservationId);
    if (existing !== undefined) {
      if (
        existing.userId !== candidate.userId ||
        existing.dateKey !== candidate.dateKey
      ) {
        throw new Error("Quota reservation identifier must be unique.");
      }
      return cloneReservation(existing);
    }

    const key = usageKey(candidate.userId, candidate.dateKey);
    const usage = this.#usage.get(key) ?? {
      userId: candidate.userId,
      dateKey: candidate.dateKey,
      reserved: 0,
      succeeded: 0,
      temporaryIncrease: 0,
      updatedAt: candidate.createdAt,
    };
    if (
      usage.reserved + usage.succeeded >=
      getDailyQuotaLimit(usage.temporaryIncrease)
    ) {
      return null;
    }

    this.#usage.set(key, {
      ...usage,
      reserved: usage.reserved + 1,
      updatedAt: candidate.updatedAt,
    });
    this.#reservations.set(
      candidate.reservationId,
      cloneReservation(candidate),
    );
    return cloneReservation(candidate);
  }

  async settle(
    reservationId: string,
    status: Exclude<QuotaReservationStatus, "reserved">,
    now: Date,
  ): Promise<DailyUsageRecord | null> {
    const reservation = this.#reservations.get(reservationId);
    if (reservation === undefined) {
      return null;
    }
    const key = usageKey(reservation.userId, reservation.dateKey);
    const usage = this.#usage.get(key);
    if (usage === undefined) {
      throw new Error("Quota usage is missing for a reservation.");
    }
    if (reservation.status !== "reserved") {
      return cloneUsage(usage);
    }

    const timestamp = now.toISOString();
    const updatedUsage: DailyUsageRecord = {
      ...usage,
      reserved: usage.reserved - 1,
      succeeded: usage.succeeded + (status === "succeeded" ? 1 : 0),
      updatedAt: timestamp,
    };
    this.#usage.set(key, updatedUsage);
    this.#reservations.set(reservationId, {
      ...reservation,
      status,
      updatedAt: timestamp,
    });
    return cloneUsage(updatedUsage);
  }

  async getUsage(
    userId: string,
    dateKey: string,
  ): Promise<DailyUsageRecord | null> {
    const usage = this.#usage.get(usageKey(userId, dateKey));
    return usage === undefined ? null : cloneUsage(usage);
  }

  async increaseTemporaryQuota(
    userId: string,
    dateKey: string,
    increase: number,
    audit: QuotaAdjustmentAuditRecord,
    now: Date,
  ): Promise<DailyUsageRecord> {
    if (this.#auditRecords.has(audit.auditId)) {
      throw new Error("Audit identifier must be unique.");
    }
    const key = usageKey(userId, dateKey);
    const usage = this.#usage.get(key) ?? {
      userId,
      dateKey,
      reserved: 0,
      succeeded: 0,
      temporaryIncrease: 0,
      updatedAt: now.toISOString(),
    };
    const updated: DailyUsageRecord = {
      ...usage,
      temporaryIncrease: usage.temporaryIncrease + increase,
      updatedAt: now.toISOString(),
    };
    this.#usage.set(key, updated);
    this.#auditRecords.set(audit.auditId, cloneAudit(audit));
    return cloneUsage(updated);
  }
}
