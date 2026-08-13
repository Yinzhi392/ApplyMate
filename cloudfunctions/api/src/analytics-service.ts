import { DomainError } from "./domain-error.js";
import type { ApplicationRepository } from "./application-repository.js";
import type { IdentityRepository } from "./identity-repository.js";
import type { JobRepository } from "./job-repository.js";

export type AnalyticsEvent =
  | { event: "app_opened" }
  | { event: "greeting_copied"; applicationId: string };

const BEIJING_TIME_ZONE = "Asia/Shanghai";

function beijingDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Math.floor(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)) /
      (24 * 60 * 60 * 1_000),
  );
}

export class AnalyticsService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly jobs: JobRepository,
    private readonly applications: ApplicationRepository,
  ) {}

  async track(
    userId: string,
    event: AnalyticsEvent,
    now: Date,
  ): Promise<{ tracked: true }> {
    const user = await this.identities.getUserById(userId);
    if (user === null) {
      throw new DomainError("NOT_FOUND", "User was not found.");
    }
    const timestamp = now.toISOString();
    const participation = { ...user.participation };

    if (event.event === "greeting_copied") {
      const application = await this.applications.getById(event.applicationId);
      if (application === null || application.userId !== userId) {
        throw new DomainError("NOT_FOUND", "Application was not found.");
      }
      participation.firstGreetingCopiedAt ??= timestamp;
    } else {
      participation.firstAppOpenedAt ??= timestamp;
      participation.lastAppOpenedAt = timestamp;
      const jobs = await this.jobs.listAllForMetrics();
      const firstSuccessAt = jobs
        .filter(
          (job) =>
            job.userId === userId &&
            (job.kind === "greeting_generate" || job.kind === "greeting_rewrite") &&
            job.status === "succeeded",
        )
        .flatMap((job) =>
          job.statusHistory
            .filter(({ status }) => status === "succeeded")
            .map(({ enteredAt }) => enteredAt),
        )
        .sort()[0];
      if (firstSuccessAt !== undefined) {
        const dayOffset =
          beijingDayNumber(now) - beijingDayNumber(new Date(firstSuccessAt));
        if (dayOffset >= 1 && dayOffset <= 6) {
          participation.returnedWithinSevenDaysAt ??= timestamp;
        }
      }
    }

    await this.identities.saveUser({
      ...user,
      participation,
      updatedAt: timestamp,
    });
    return { tracked: true };
  }
}
