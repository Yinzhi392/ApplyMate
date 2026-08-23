import { z } from "zod";

export const ServicePhaseSchema = z.enum(["active", "read_only", "retired"]);
export type ServicePhase = z.infer<typeof ServicePhaseSchema>;

export const AiAvailabilitySchema = z.enum([
  "available",
  "budget_paused",
  "scheduled_closed",
  "resource_paused",
]);
export type AiAvailability = z.infer<typeof AiAvailabilitySchema>;

export const ServiceAccessSchema = z
  .object({
    phase: ServicePhaseSchema,
    aiAvailability: AiAvailabilitySchema,
    aiClosesAt: z.string().datetime({ offset: true }),
    dataAccessEndsAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ServiceAccess = z.infer<typeof ServiceAccessSchema>;

export const ServiceScheduleSchema = z
  .object({
    publicLaunchAt: z.string().datetime({ offset: true }),
    aiClosesAt: z.string().datetime({ offset: true }),
    dataAccessEndsAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((schedule, context) => {
    const launchAt = Date.parse(schedule.publicLaunchAt);
    const aiClosesAt = Date.parse(schedule.aiClosesAt);
    const dataAccessEndsAt = Date.parse(schedule.dataAccessEndsAt);
    if (!(launchAt < aiClosesAt && aiClosesAt < dataAccessEndsAt)) {
      context.addIssue({
        code: "custom",
        message: "Service schedule dates must be strictly increasing.",
      });
    }
    const derived = deriveServiceSchedule(schedule.publicLaunchAt);
    if (
      Date.parse(schedule.aiClosesAt) !== Date.parse(derived.aiClosesAt) ||
      Date.parse(schedule.dataAccessEndsAt) !== Date.parse(derived.dataAccessEndsAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Service schedule must close at two and six Beijing calendar months.",
      });
    }
  });
export type ServiceSchedule = z.infer<typeof ServiceScheduleSchema>;

function addBeijingCalendarMonths(value: string, months: number): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError("Service launch time must be valid.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  const sourceYear = Number(values.year);
  const sourceMonthIndex = Number(values.month) - 1;
  const totalMonths = sourceYear * 12 + sourceMonthIndex + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = totalMonths % 12;
  const targetMonth = targetMonthIndex + 1;
  const maximumDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(Number(values.day), maximumDay);
  const pad = (number: number, length = 2): string => String(number).padStart(length, "0");
  return `${pad(targetYear, 4)}-${pad(targetMonth)}-${pad(targetDay)}T${values.hour}:${values.minute}:${values.second}.${pad(instant.getUTCMilliseconds(), 3)}+08:00`;
}

export function deriveServiceSchedule(publicLaunchAt: string): ServiceSchedule {
  return {
    publicLaunchAt,
    aiClosesAt: addBeijingCalendarMonths(publicLaunchAt, 2),
    dataAccessEndsAt: addBeijingCalendarMonths(publicLaunchAt, 6),
  };
}

export interface ServiceAvailabilityInput {
  budgetPaused: boolean;
  resourcePaused: boolean;
}

export function resolveServiceAccess(
  scheduleInput: ServiceSchedule,
  now: Date,
  availability: ServiceAvailabilityInput,
): ServiceAccess {
  const schedule = ServiceScheduleSchema.parse(scheduleInput);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("Service access requires a valid current time.");
  }
  const aiClosesAtMs = Date.parse(schedule.aiClosesAt);
  const dataAccessEndsAtMs = Date.parse(schedule.dataAccessEndsAt);
  const phase: ServicePhase = nowMs >= dataAccessEndsAtMs
    ? "retired"
    : nowMs >= aiClosesAtMs
      ? "read_only"
      : "active";
  const aiAvailability: AiAvailability = phase !== "active"
    ? "scheduled_closed"
    : availability.budgetPaused
      ? "budget_paused"
      : availability.resourcePaused
        ? "resource_paused"
        : "available";
  return ServiceAccessSchema.parse({
    phase,
    aiAvailability,
    aiClosesAt: schedule.aiClosesAt,
    dataAccessEndsAt: schedule.dataAccessEndsAt,
  });
}

export function assertAiTaskAvailable(access: ServiceAccess): void {
  const parsed = ServiceAccessSchema.parse(access);
  if (parsed.phase !== "active" || parsed.aiAvailability !== "available") {
    throw new Error(
      parsed.phase === "active"
        ? parsed.aiAvailability
        : "scheduled_closed",
    );
  }
}
