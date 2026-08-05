import { describe, expect, it } from "vitest";

import {
  InMemoryIdentityRepository,
  InMemoryJobRepository,
  JobService,
  UserService,
  createIdentityAccessApi,
} from "../../cloudfunctions/api/src/index.js";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  type JobStatus,
} from "../../shared/src/index.js";

const currentVersions = {
  userAgreementVersion: "user-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};
const now = new Date("2026-08-05T12:00:00.000Z");

function requestId(index: number): string {
  return `${index.toString().padStart(8, "0")}-1234-4234-a234-123456789abc`;
}

async function moveToStatus(
  jobs: JobService,
  jobId: string,
  status: JobStatus,
): Promise<void> {
  const paths: Record<JobStatus, JobStatus[]> = {
    queued: [],
    ocr: ["ocr"],
    parsing: ["parsing"],
    awaiting_user_confirmation: ["parsing", "awaiting_user_confirmation"],
    generating: ["parsing", "generating"],
    validating: ["parsing", "generating", "validating"],
    succeeded: ["parsing", "succeeded"],
    failed: ["failed"],
  };
  for (const nextStatus of paths[status]) {
    await jobs.transitionJob(jobId, nextStatus, now);
  }
}

describe("job.get", () => {
  it("returns a safe, understandable view for every task status", async () => {
    const identityRepository = new InMemoryIdentityRepository();
    const user = await new UserService(identityRepository).getOrCreateUser(
      "wx_synthetic_admin",
      now,
    );
    let jobIndex = 0;
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => `job_synthetic_${String(++jobIndex).padStart(3, "0")}`,
    );
    const api = createIdentityAccessApi({
      repository: identityRepository,
      jobs,
      currentVersions,
      adminOpenIds: ["wx_synthetic_admin"],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_admin" }),
    });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(1),
    });

    for (const status of JOB_STATUSES) {
      const job = await jobs.createJob(user.userId, "resume_parse", now);
      if (status === "succeeded") {
        await jobs.transitionJob(job.jobId, "parsing", now);
        await jobs.finishSucceeded(
          job.jobId,
          { profileReady: true },
          now,
        );
      } else {
        await moveToStatus(jobs, job.jobId, status);
      }
      if (status === "queued") {
        await jobs.claimJob(job.jobId, "worker_secret", now);
      }

      const response = await api({
        action: "job.get",
        payload: { jobId: job.jobId },
      });
      expect(response).toMatchObject({
        ok: true,
        data: {
          jobId: job.jobId,
          kind: "resume_parse",
          status,
          statusLabel: JOB_STATUS_LABELS[status],
        },
      });
      expect(JSON.stringify(response)).not.toContain("worker_secret");
      expect(JSON.stringify(response)).not.toContain(user.userId);
      if (status === "succeeded") {
        expect(response).toMatchObject({
          ok: true,
          data: { result: { profileReady: true } },
        });
      }
    }
  });

  it("returns not found for another user's job", async () => {
    const identityRepository = new InMemoryIdentityRepository();
    const users = new UserService(identityRepository);
    const owner = await users.getOrCreateUser("wx_synthetic_owner", now);
    const jobs = new JobService(
      new InMemoryJobRepository(),
      () => "job_synthetic_private",
    );
    const job = await jobs.createJob(owner.userId, "greeting_generate", now);
    const api = createIdentityAccessApi({
      repository: identityRepository,
      jobs,
      currentVersions,
      adminOpenIds: ["wx_synthetic_other"],
      now: () => now,
      readCloudBaseContext: () => ({ OPENID: "wx_synthetic_other" }),
    });
    await api({
      action: "agreement.accept",
      payload: currentVersions,
      requestId: requestId(2),
    });

    await expect(
      api({ action: "job.get", payload: { jobId: job.jobId } }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
