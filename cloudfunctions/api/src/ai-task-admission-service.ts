import { randomUUID } from "node:crypto";

import {
  getBeijingDateKey,
  type ServiceAccess,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";

export const MONTHLY_BUDGET_LIMIT_FEN = 10_000;
export const MONTHLY_BUDGET_WARNING_FEN = 8_000;
export const MONTHLY_BUDGET_STOP_FEN = 9_000;
export const USER_DAILY_SUCCESS_LIMIT = 20;
export const USER_ACTIVE_AI_JOB_LIMIT = 1;
export const USER_CREATE_WINDOW_MS = 10 * 60_000;
export const USER_CREATE_WINDOW_LIMIT = 3;

export type AdmissionStatus = "reserved" | "succeeded" | "released";

export interface BudgetPeriodRecord {
  periodKey: string;
  limitFen: number;
  warningFen: number;
  stopFen: number;
  fixedCostFen: number;
  conservativeSettledFen: number;
  reservedFen: number;
  officialBilledFen: number;
  officialSnapshotAt?: string;
  updatedAt: string;
}

export interface AiTaskAdmissionRecord {
  admissionId: string;
  jobId: string;
  userId: string;
  periodKey: string;
  dateKey: string;
  reservedCostFen: number;
  settledCostFen?: number;
  status: AdmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdmissionRequest {
  admissionId?: string;
  estimatedCostFen: number;
  jobId: string;
  now: Date;
  serviceAccess: ServiceAccess;
  userId: string;
}

export interface BudgetStatusView extends BudgetPeriodRecord {
  exposureFen: number;
  remainingBeforeStopFen: number;
  state: "normal" | "warning" | "paused";
}

export interface AiTaskAdmissionRepository {
  configurePeriod(periodKey: string, fixedCostFen: number, now: Date): Promise<void>;
  reserve(request: Required<AdmissionRequest>): Promise<AiTaskAdmissionRecord>;
  settle(
    admissionId: string,
    status: Exclude<AdmissionStatus, "reserved">,
    actualCostFen: number,
    now: Date,
  ): Promise<AiTaskAdmissionRecord>;
  getBudgetStatus(periodKey: string, now: Date): Promise<BudgetStatusView>;
  updateOfficialBill(
    periodKey: string,
    billedFen: number,
    snapshotAt: Date,
    now: Date,
  ): Promise<BudgetStatusView>;
}

function periodKeyFor(now: Date): string {
  return getBeijingDateKey(now).slice(0, 7);
}

function assertFen(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer in fen.`);
  }
}

function exposure(period: BudgetPeriodRecord): number {
  return period.fixedCostFen +
    Math.max(period.conservativeSettledFen, period.officialBilledFen) +
    period.reservedFen;
}

function toBudgetView(period: BudgetPeriodRecord): BudgetStatusView {
  const exposureFen = exposure(period);
  return {
    ...structuredClone(period),
    exposureFen,
    remainingBeforeStopFen: Math.max(0, period.stopFen - exposureFen),
    state: exposureFen >= period.stopFen
      ? "paused"
      : exposureFen >= period.warningFen
        ? "warning"
        : "normal",
  };
}

function cloneAdmission(record: AiTaskAdmissionRecord): AiTaskAdmissionRecord {
  return structuredClone(record);
}

export class InMemoryAiTaskAdmissionRepository implements AiTaskAdmissionRepository {
  readonly #admissions = new Map<string, AiTaskAdmissionRecord>();
  readonly #periods = new Map<string, BudgetPeriodRecord>();
  readonly #successfulByUserDate = new Map<string, number>();
  readonly #activeByUser = new Map<string, string>();
  readonly #createdByUser = new Map<string, number[]>();

  async configurePeriod(periodKey: string, fixedCostFen: number, now: Date): Promise<void> {
    assertFen(fixedCostFen, "Fixed cost");
    const existing = this.#periods.get(periodKey);
    const timestamp = now.toISOString();
    this.#periods.set(periodKey, {
      periodKey,
      limitFen: MONTHLY_BUDGET_LIMIT_FEN,
      warningFen: MONTHLY_BUDGET_WARNING_FEN,
      stopFen: MONTHLY_BUDGET_STOP_FEN,
      fixedCostFen,
      conservativeSettledFen: existing?.conservativeSettledFen ?? 0,
      reservedFen: existing?.reservedFen ?? 0,
      officialBilledFen: existing?.officialBilledFen ?? 0,
      ...(existing?.officialSnapshotAt === undefined
        ? {}
        : { officialSnapshotAt: existing.officialSnapshotAt }),
      updatedAt: timestamp,
    });
  }

  async reserve(request: Required<AdmissionRequest>): Promise<AiTaskAdmissionRecord> {
    assertFen(request.estimatedCostFen, "Estimated cost");
    const existing = this.#admissions.get(request.admissionId);
    if (existing !== undefined) {
      if (existing.userId !== request.userId || existing.jobId !== request.jobId) {
        throw new DomainError("CONFLICT", "Admission identifier is already in use.");
      }
      return cloneAdmission(existing);
    }
    if (request.serviceAccess.phase !== "active") {
      throw new DomainError("SERVICE_READ_ONLY", "AI generation is closed for the read-only service period.");
    }
    if (request.serviceAccess.aiAvailability !== "available") {
      throw new DomainError(
        request.serviceAccess.aiAvailability === "budget_paused"
          ? "MONTHLY_BUDGET_EXHAUSTED"
          : "RESOURCE_PAUSED",
        "AI generation is temporarily unavailable.",
      );
    }
    if (this.#activeByUser.has(request.userId)) {
      throw new DomainError("ACTIVE_JOB_EXISTS", "Only one AI task can run at a time.");
    }
    const nowMs = request.now.getTime();
    const recentCreates = (this.#createdByUser.get(request.userId) ?? [])
      .filter((createdAt) => nowMs - createdAt < USER_CREATE_WINDOW_MS);
    if (recentCreates.length >= USER_CREATE_WINDOW_LIMIT) {
      throw new DomainError("RATE_LIMITED", "Too many AI tasks were created in the last ten minutes.", true);
    }
    const dateKey = getBeijingDateKey(request.now);
    const usageKey = `${request.userId}\0${dateKey}`;
    if ((this.#successfulByUserDate.get(usageKey) ?? 0) >= USER_DAILY_SUCCESS_LIMIT) {
      throw new DomainError("LIMIT_EXCEEDED", "Daily AI quota is exhausted.");
    }
    const periodKey = periodKeyFor(request.now);
    const period = this.#periods.get(periodKey);
    if (period === undefined) {
      throw new DomainError("RESOURCE_PAUSED", "Monthly budget configuration is unavailable.");
    }
    if (exposure(period) + request.estimatedCostFen >= period.stopFen) {
      throw new DomainError("MONTHLY_BUDGET_EXHAUSTED", "Monthly AI budget is paused.");
    }
    const timestamp = request.now.toISOString();
    const record: AiTaskAdmissionRecord = {
      admissionId: request.admissionId,
      jobId: request.jobId,
      userId: request.userId,
      periodKey,
      dateKey,
      reservedCostFen: request.estimatedCostFen,
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#periods.set(periodKey, {
      ...period,
      reservedFen: period.reservedFen + request.estimatedCostFen,
      updatedAt: timestamp,
    });
    this.#admissions.set(record.admissionId, record);
    this.#activeByUser.set(request.userId, record.admissionId);
    this.#createdByUser.set(request.userId, [...recentCreates, nowMs]);
    return cloneAdmission(record);
  }

  async settle(
    admissionId: string,
    status: Exclude<AdmissionStatus, "reserved">,
    actualCostFen: number,
    now: Date,
  ): Promise<AiTaskAdmissionRecord> {
    assertFen(actualCostFen, "Actual cost");
    const admission = this.#admissions.get(admissionId);
    if (admission === undefined) {
      throw new DomainError("NOT_FOUND", "AI task admission was not found.");
    }
    if (admission.status !== "reserved") {
      return cloneAdmission(admission);
    }
    const period = this.#periods.get(admission.periodKey);
    if (period === undefined) {
      throw new Error("Budget period is missing for an admission.");
    }
    const timestamp = now.toISOString();
    const updated: AiTaskAdmissionRecord = {
      ...admission,
      status,
      settledCostFen: status === "succeeded" ? actualCostFen : 0,
      updatedAt: timestamp,
    };
    this.#periods.set(admission.periodKey, {
      ...period,
      reservedFen: Math.max(0, period.reservedFen - admission.reservedCostFen),
      conservativeSettledFen: period.conservativeSettledFen +
        (status === "succeeded" ? actualCostFen : 0),
      updatedAt: timestamp,
    });
    if (status === "succeeded") {
      const usageKey = `${admission.userId}\0${admission.dateKey}`;
      this.#successfulByUserDate.set(
        usageKey,
        (this.#successfulByUserDate.get(usageKey) ?? 0) + 1,
      );
    }
    this.#admissions.set(admissionId, updated);
    if (this.#activeByUser.get(admission.userId) === admissionId) {
      this.#activeByUser.delete(admission.userId);
    }
    return cloneAdmission(updated);
  }

  async getBudgetStatus(periodKey: string, now: Date): Promise<BudgetStatusView> {
    const period = this.#periods.get(periodKey);
    if (period === undefined) {
      throw new DomainError("NOT_FOUND", "Budget period was not found.");
    }
    return toBudgetView({ ...period, updatedAt: now.toISOString() });
  }

  async updateOfficialBill(
    periodKey: string,
    billedFen: number,
    snapshotAt: Date,
    now: Date,
  ): Promise<BudgetStatusView> {
    assertFen(billedFen, "Official bill");
    const period = this.#periods.get(periodKey);
    if (period === undefined) {
      throw new DomainError("NOT_FOUND", "Budget period was not found.");
    }
    const updated: BudgetPeriodRecord = {
      ...period,
      officialBilledFen: billedFen,
      officialSnapshotAt: snapshotAt.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.#periods.set(periodKey, updated);
    return toBudgetView(updated);
  }
}

export class AiTaskAdmissionService {
  constructor(
    private readonly repository: AiTaskAdmissionRepository,
    private readonly createAdmissionId: () => string = () => `admission_${randomUUID()}`,
  ) {}

  reserve(request: AdmissionRequest): Promise<AiTaskAdmissionRecord> {
    return this.repository.reserve({
      ...request,
      admissionId: request.admissionId ?? this.createAdmissionId(),
    });
  }

  succeed(admissionId: string, actualCostFen: number, now: Date): Promise<AiTaskAdmissionRecord> {
    return this.repository.settle(admissionId, "succeeded", actualCostFen, now);
  }

  release(admissionId: string, now: Date): Promise<AiTaskAdmissionRecord> {
    return this.repository.settle(admissionId, "released", 0, now);
  }
}
