import { describe, expect, it } from "vitest";

import {
  ActionRegistry,
  AgreementService,
  IdempotencyService,
  InMemoryIdempotencyRepository,
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  InMemoryQuotaRepository,
  JobDispatchService,
  JobService,
  QuotaService,
  ResourceGateService,
  STALE_JOB_AGE_MS,
  StaleJobCleanupService,
  UserService,
  WorkerExecutionService,
  createApiEntry,
  createIdentityAccessApi,
  hashTrustedOpenId,
} from "../../cloudfunctions/api/src/index.js";

const versions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const openId = "wx_phase_4_integration";
const requestId = "123e4567-e89b-42d3-a456-426614174040";

function readJobId(response: Awaited<ReturnType<ReturnType<typeof createApiEntry>>>): string {
  if (
    !response.ok ||
    response.data === null ||
    typeof response.data !== "object" ||
    !("jobId" in response.data) ||
    typeof response.data.jobId !== "string"
  ) {
    throw new Error("Expected a successful job response.");
  }
  return response.data.jobId;
}

describe("Phase 4 task infrastructure", () => {
  it("coalesces creation, supports resumed queries, settles quota, and resets in Beijing", async () => {
    const startedAt = new Date("2026-08-05T15:59:50.000Z");
    let now = startedAt;
    const identityRepository = new InMemoryIdentityRepository();
    const jobRepository = new InMemoryJobRepository();
    const quotaRepository = new InMemoryQuotaRepository();
    const jobs = new JobService(jobRepository, () => "job_integration");
    const quotas = new QuotaService(quotaRepository);
    const idempotency = new IdempotencyService(
      new InMemoryIdempotencyRepository(),
    );
    const users = new UserService(identityRepository);
    const owner = await users.getOrCreateUser(openId, now);
    await new AgreementService(identityRepository, versions).acceptAgreements(
      owner,
      versions,
      now,
    );
    const dispatched: string[] = [];
    const dispatch = new JobDispatchService(jobs, {
      dispatch: (jobId) => dispatched.push(jobId),
    });
    const registry = new ActionRegistry();
    registry.register("generation.create", async (_payload, context) => {
      const reservationId = `reservation_${context.requestId}`;
      await quotas.reserve(owner.userId, reservationId, now);
      const job = await dispatch.createAndDispatch(
        owner.userId,
        "greeting_generate",
        now,
        reservationId,
      );
      return { ok: true, data: { jobId: job.jobId } };
    });
    const createGenerationApi = (resourcesAvailable: boolean) =>
      createApiEntry({
        registry,
        readCloudBaseContext: () => ({ OPENID: openId }),
        idempotency: {
          service: idempotency,
          createCallerKey: hashTrustedOpenId,
          now: () => now,
        },
        resourceGate: {
          service: new ResourceGateService({
            ocr: resourcesAvailable,
            model: resourcesAvailable,
            compute_storage: resourcesAvailable,
          }),
          resolveRequirements: () => ["ocr", "model", "compute_storage"],
        },
      });
    const request = {
      action: "generation.create" as const,
      payload: { synthetic: true },
      requestId,
    };

    const [first, duplicate] = await Promise.all([
      createGenerationApi(true)(request),
      createGenerationApi(true)(request),
    ]);
    const replayAfterPause = await createGenerationApi(false)(request);
    const jobId = readJobId(first);

    expect(duplicate).toEqual(first);
    expect(replayAfterPause).toEqual(first);
    expect(dispatched).toEqual([jobId]);
    await expect(quotas.getUsage(owner.userId, now)).resolves.toMatchObject({
      reserved: 1,
      succeeded: 0,
      remaining: 4,
    });

    const createQueryApi = () =>
      createIdentityAccessApi({
        repository: identityRepository,
        jobs,
        currentVersions: versions,
        adminOpenIds: [openId],
        now: () => now,
        readCloudBaseContext: () => ({ OPENID: openId }),
      });
    await expect(
      createQueryApi()({ action: "job.get", payload: { jobId } }),
    ).resolves.toMatchObject({
      ok: true,
      data: { status: "queued", statusLabel: "排队" },
    });

    now = new Date("2026-08-05T15:59:55.000Z");
    await new WorkerExecutionService(jobs, quotas, () => now).run(
      jobId,
      "worker_integration",
      now,
      async () => {
        await jobs.transitionJob(jobId, "ocr", now);
        await jobs.transitionJob(jobId, "parsing", now);
        await jobs.transitionJob(jobId, "generating", now);
        await jobs.transitionJob(jobId, "validating", now);
        return { result: { greeting: "synthetic result" } };
      },
    );
    await expect(
      createQueryApi()({ action: "job.get", payload: { jobId } }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        status: "succeeded",
        statusLabel: "成功",
        result: { greeting: "synthetic result" },
      },
    });
    await expect(quotas.getUsage(owner.userId, now)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 1,
      remaining: 4,
    });

    now = new Date("2026-08-05T16:00:00.000Z");
    const nextDayReservations = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        quotas.reserve(owner.userId, `next_day_${index}`, now),
      ),
    );
    expect(nextDayReservations.filter(({ status }) => status === "fulfilled"))
      .toHaveLength(5);
    expect(nextDayReservations.filter(({ status }) => status === "rejected"))
      .toHaveLength(1);
    await expect(quotas.getUsage(owner.userId, now)).resolves.toMatchObject({
      dateKey: "2026-08-06",
      reserved: 5,
      succeeded: 0,
      remaining: 0,
    });
  });

  it("keeps execution below 45 seconds and recovers stale work at ten minutes", async () => {
    const startedAt = new Date("2026-08-05T08:00:00.000Z");
    const jobRepository = new InMemoryJobRepository();
    const quotaRepository = new InMemoryQuotaRepository();
    const jobs = new JobService(jobRepository, () => "job_stale_integration");
    const quotas = new QuotaService(quotaRepository);
    await quotas.reserve("user_stale", "reservation_stale", startedAt);
    const job = await jobs.createJob(
      "user_stale",
      "resume_parse",
      startedAt,
      "reservation_stale",
    );

    expect(
      () => new WorkerExecutionService(jobs, quotas, () => startedAt, 45_000),
    ).toThrow("below 45 seconds");
    const cleanup = new StaleJobCleanupService(jobs, quotas);
    await expect(
      cleanup.run(new Date(startedAt.getTime() + STALE_JOB_AGE_MS - 1)),
    ).resolves.toEqual({ candidates: 0, failed: 0 });
    await expect(
      cleanup.run(new Date(startedAt.getTime() + STALE_JOB_AGE_MS)),
    ).resolves.toEqual({ candidates: 1, failed: 1 });
    await expect(jobs.getJobForUser("user_stale", job.jobId)).resolves.toMatchObject({
      status: "failed",
      error: { code: "JOB_STALE_TIMEOUT", retryable: true },
    });
    await expect(quotas.getUsage("user_stale", startedAt)).resolves.toMatchObject({
      reserved: 0,
      succeeded: 0,
      remaining: 5,
    });
  });
});
