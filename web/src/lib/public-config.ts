import { ServiceScheduleSchema, type ServiceSchedule } from "../../../shared/src/service-access";

const configuredSchedule = ServiceScheduleSchema.safeParse({
  publicLaunchAt: import.meta.env.VITE_PUBLIC_LAUNCH_AT,
  aiClosesAt: import.meta.env.VITE_AI_CLOSES_AT,
  dataAccessEndsAt: import.meta.env.VITE_DATA_ACCESS_ENDS_AT,
});

export const PUBLIC_SERVICE_SCHEDULE: ServiceSchedule | undefined = configuredSchedule.success
  ? configuredSchedule.data
  : undefined;

export function formatPublicDate(value: string | undefined): string {
  if (value === undefined) return "正式上线时公布";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
