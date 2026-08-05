import { describe, expect, it } from "vitest";

import {
  InMemoryJobRepository,
  JobService,
} from "../../cloudfunctions/api/src/index.js";

const createdAt = new Date("2026-08-05T12:00:00.000Z");

function createService(): JobService {
  return new JobService(new InMemoryJobRepository(), () => "job_synthetic_001");
}

describe("AI job service", () => {
  it("allows exactly one concurrent worker claim", async () => {
    const repository = new InMemoryJobRepository();
    const service = new JobService(repository, () => "job_synthetic_001");
    const job = await service.createJob(
      "user_synthetic_a",
      "resume_parse",
      createdAt,
    );

    const claims = await Promise.all([
      service.claimJob(job.jobId, "worker_a", createdAt),
      service.claimJob(job.jobId, "worker_b", createdAt),
    ]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(new Set(claims.filter(Boolean).map((claim) => claim?.claimedBy))).toEqual(
      new Set([claims.find((claim) => claim !== null)?.claimedBy]),
    );
  });

  it("rejects backward transitions and repeated terminal writes", async () => {
    const service = createService();
    const job = await service.createJob(
      "user_synthetic_a",
      "resume_parse",
      createdAt,
    );

    await service.transitionJob(
      job.jobId,
      "parsing",
      new Date("2026-08-05T12:00:01.000Z"),
    );
    await expect(
      service.transitionJob(
        job.jobId,
        "queued",
        new Date("2026-08-05T12:00:02.000Z"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await service.transitionJob(
      job.jobId,
      "succeeded",
      new Date("2026-08-05T12:00:03.000Z"),
    );
    await expect(
      service.transitionJob(
        job.jobId,
        "succeeded",
        new Date("2026-08-05T12:00:04.000Z"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("hides jobs from other users", async () => {
    const service = createService();
    const job = await service.createJob(
      "user_synthetic_a",
      "greeting_generate",
      createdAt,
    );

    await expect(
      service.getJobForUser("user_synthetic_b", job.jobId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.getJobForUser("user_synthetic_a", job.jobId),
    ).resolves.toMatchObject({ jobId: job.jobId, status: "queued" });
  });
});
