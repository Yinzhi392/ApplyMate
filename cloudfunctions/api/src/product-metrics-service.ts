import type { FeedbackRepository } from "./feedback-repository.js";
import type { IdentityRepository } from "./identity-repository.js";
import type { JobRepository } from "./job-repository.js";
import type { ResumeRepository } from "./resume-repository.js";

export interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface ProductMetrics {
  firstResumeConfirmationRate: RateMetric;
  generationSuccessRate: RateMetric;
  copyRate: RateMetric;
  satisfactionRate: RateMetric;
  sevenDayReturnRate: RateMetric;
}

function metric(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}

function isGreetingJob(kind: string): boolean {
  return kind === "greeting_generate" || kind === "greeting_rewrite";
}

export class ProductMetricsService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly resumes: ResumeRepository,
    private readonly jobs: JobRepository,
    private readonly feedback: FeedbackRepository,
    private readonly excludedUserIds: ReadonlySet<string> = new Set(),
  ) {}

  async get(): Promise<ProductMetrics> {
    const [allUsers, allResumes, allJobs, allFeedback] = await Promise.all([
      this.identities.listUsersForMetrics(),
      this.resumes.listAllForMetrics(),
      this.jobs.listAllForMetrics(),
      this.feedback.listAllForMetrics(),
    ]);
    const users = allUsers.filter(
      (user) =>
        user.activationStatus === "active" &&
        user.activatedAt !== undefined &&
        !this.excludedUserIds.has(user.userId),
    );
    const eligibleUserIds = new Set(users.map(({ userId }) => userId));

    const firstResumeNumerator = users.filter((user) => {
      const activationTime = new Date(user.activatedAt!).getTime();
      const firstConfirmed = allResumes
        .filter(
          (resume) =>
            resume.userId === user.userId && resume.confirmedAt !== undefined,
        )
        .map((resume) => new Date(resume.confirmedAt!).getTime())
        .sort((left, right) => left - right)[0];
      return (
        firstConfirmed !== undefined &&
        firstConfirmed >= activationTime &&
        firstConfirmed <= activationTime + 168 * 60 * 60 * 1_000
      );
    }).length;

    const enteredGenerationJobs = allJobs.filter(
      (job) =>
        eligibleUserIds.has(job.userId) &&
        isGreetingJob(job.kind) &&
        job.statusHistory.some(({ status }) => status === "generating"),
    );
    const successfulGenerationJobs = enteredGenerationJobs.filter(
      ({ status }) => status === "succeeded",
    );
    const successfulGenerationUserIds = new Set(
      successfulGenerationJobs.map(({ userId }) => userId),
    );
    const copiedUserIds = new Set(
      users
        .filter(
          (user) =>
            successfulGenerationUserIds.has(user.userId) &&
            user.participation?.firstGreetingCopiedAt !== undefined,
        )
        .map(({ userId }) => userId),
    );
    const validFeedback = allFeedback.filter((record) =>
      eligibleUserIds.has(record.userId),
    );
    const returnedUserIds = new Set(
      users
        .filter(
          (user) =>
            successfulGenerationUserIds.has(user.userId) &&
            user.participation?.returnedWithinSevenDaysAt !== undefined,
        )
        .map(({ userId }) => userId),
    );

    return {
      firstResumeConfirmationRate: metric(firstResumeNumerator, users.length),
      generationSuccessRate: metric(
        successfulGenerationJobs.length,
        enteredGenerationJobs.length,
      ),
      copyRate: metric(copiedUserIds.size, successfulGenerationUserIds.size),
      satisfactionRate: metric(
        validFeedback.filter(({ rating }) => rating === "satisfied").length,
        validFeedback.length,
      ),
      sevenDayReturnRate: metric(
        returnedUserIds.size,
        successfulGenerationUserIds.size,
      ),
    };
  }
}
