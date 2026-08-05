import {
  JobDescriptionSchema,
  evaluateJobDescription,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type { GenerationRepository } from "./generation-repository.js";
import type { JobDispatchPort } from "./job-dispatch-service.js";
import type { JobService } from "./job-service.js";
import type { QuotaService } from "./quota-service.js";

export interface GenerationConfirmationDependencies {
  generations: GenerationRepository;
  jobs: JobService;
  quotas: QuotaService;
  dispatcher: JobDispatchPort;
}

export class GenerationConfirmationService {
  constructor(private readonly dependencies: GenerationConfirmationDependencies) {}

  async confirm(
    userId: string,
    jobId: string,
    jobDescriptionInput: unknown,
    now: Date,
  ): Promise<{ jobId: string }> {
    const record = await this.dependencies.generations.getByJobId(jobId);
    if (record === null || record.userId !== userId) {
      throw new DomainError("NOT_FOUND", "Generation task was not found.");
    }
    if (record.status !== "awaiting_confirmation") {
      throw new DomainError("CONFLICT", "Generation task is not awaiting confirmation.");
    }
    const parsed = JobDescriptionSchema.safeParse(jobDescriptionInput);
    if (!parsed.success || evaluateJobDescription(parsed.data).status !== "ready") {
      throw new DomainError("INVALID_REQUEST", "Confirmed JD fields are incomplete.");
    }

    const reservationId = `quota_${jobId}`;
    await this.dependencies.quotas.reserve(userId, reservationId, now);
    try {
      await this.dependencies.jobs.transitionJob(jobId, "generating", now, {
        quotaReservationId: reservationId,
        clearClaim: true,
        result: {
          jobDescription: parsed.data,
          pendingFieldIds: [],
          warnings: evaluateJobDescription(parsed.data).warnings,
        },
      });
      const saved = await this.dependencies.generations.saveIfStatus(
        {
          ...record,
          status: "generating",
          jobDescription: parsed.data,
          pendingFieldIds: [],
          warnings: evaluateJobDescription(parsed.data).warnings,
          updatedAt: now.toISOString(),
        },
        "awaiting_confirmation",
      );
      if (saved === null) {
        throw new DomainError("CONFLICT", "Generation task changed concurrently.");
      }
      this.dependencies.dispatcher.dispatch(jobId);
      return { jobId };
    } catch (error) {
      await this.dependencies.quotas.release(reservationId, now);
      const current = await this.dependencies.jobs.getJobForUser(userId, jobId);
      if (current.status === "generating") {
        await this.dependencies.jobs.finishFailed(
          jobId,
          {
            code: "JOB_DISPATCH_FAILED",
            message: "Greeting generation could not be continued.",
            retryable: true,
          },
          now,
        );
        await this.dependencies.generations.save({
          ...record,
          status: "failed",
          updatedAt: now.toISOString(),
        });
      }
      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError(
        "JOB_FAILED",
        "Greeting generation could not be continued.",
        true,
      );
    }
  }
}
