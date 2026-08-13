import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CloudBaseJobRepository } = require("../../cloudfunctions/api/deploy/cloudbase-job-repository.js") as {
  CloudBaseJobRepository: new (collection: unknown) => {
    createJob(job: Job): Promise<void>;
    getJobById(jobId: string): Promise<Job | null>;
    claimJob(jobId: string, workerId: string, now: Date): Promise<Job | null>;
    transitionJob(
      jobId: string,
      expectedStatus: string,
      nextStatus: string,
      now: Date,
      updates?: Record<string, unknown>,
    ): Promise<Job | null>;
  };
};

interface Job extends Record<string, unknown> {
  jobId: string;
  userId: string;
  kind: string;
  status: string;
  statusHistory: Array<{ status: string; enteredAt: string }>;
  claimedBy?: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
}

type StoredDocument = Record<string, unknown>;

function matches(document: StoredDocument, query: StoredDocument): boolean {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

function createCollection() {
  const documents: StoredDocument[] = [];
  return {
    documents,
    collection: {
      where(query: StoredDocument) {
        const selected = () => documents.filter((document) => matches(document, query));
        return {
          limit() {
            return {
              async get() {
                return { data: selected().map((document) => structuredClone(document)) };
              },
            };
          },
          async update(update: StoredDocument) {
            const targets = selected();
            targets.forEach((document) => Object.assign(document, structuredClone(update)));
            return { updated: targets.length };
          },
        };
      },
      async add(document: StoredDocument) {
        if (documents.some((candidate) => candidate._id === document._id)) {
          throw new Error("duplicate document");
        }
        documents.push(structuredClone(document));
        return { id: document._id };
      },
    },
  };
}

function queuedJob(): Job {
  const timestamp = "2026-08-13T08:00:00.000Z";
  return {
    jobId: "job_synthetic_cloudbase_001",
    userId: "user_synthetic_cloudbase",
    kind: "resume_parse",
    status: "queued",
    statusHistory: [{ status: "queued", enteredAt: timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("CloudBase job repository", () => {
  it("persists a job without leaking storage-only fields", async () => {
    const state = createCollection();
    const repository = new CloudBaseJobRepository(state.collection);
    await repository.createJob(queuedJob());
    await expect(repository.getJobById(queuedJob().jobId)).resolves.toEqual(queuedJob());
    expect(state.documents[0]).toMatchObject({
      _id: queuedJob().jobId,
      recordType: "ai_job",
      claimState: "available",
    });
    await expect(repository.createJob(queuedJob())).rejects.toThrow(
      "Job identifier must be unique.",
    );
  });

  it("allows exactly one worker to claim a job", async () => {
    const state = createCollection();
    const repository = new CloudBaseJobRepository(state.collection);
    await repository.createJob(queuedJob());
    const now = new Date("2026-08-13T08:00:01.000Z");
    const [first, second] = await Promise.all([
      repository.claimJob(queuedJob().jobId, "worker_one", now),
      repository.claimJob(queuedJob().jobId, "worker_two", now),
    ]);
    expect([first, second].filter((claim) => claim !== null)).toHaveLength(1);
    expect((await repository.getJobById(queuedJob().jobId))?.claimedBy).toMatch(
      /^worker_(one|two)$/u,
    );
  });

  it("uses status and updatedAt as an optimistic transition guard", async () => {
    const state = createCollection();
    const repository = new CloudBaseJobRepository(state.collection);
    await repository.createJob(queuedJob());
    const parsed = await repository.transitionJob(
      queuedJob().jobId,
      "queued",
      "parsing",
      new Date("2026-08-13T08:00:02.000Z"),
    );
    expect(parsed).toMatchObject({
      status: "parsing",
      statusHistory: [
        { status: "queued" },
        { status: "parsing", enteredAt: "2026-08-13T08:00:02.000Z" },
      ],
    });
    await expect(
      repository.transitionJob(
        queuedJob().jobId,
        "queued",
        "failed",
        new Date("2026-08-13T08:00:03.000Z"),
      ),
    ).resolves.toBeNull();
  });

  it("clears a worker claim when a retry is released", async () => {
    const state = createCollection();
    const repository = new CloudBaseJobRepository(state.collection);
    await repository.createJob(queuedJob());
    await repository.claimJob(
      queuedJob().jobId,
      "worker_one",
      new Date("2026-08-13T08:00:01.000Z"),
    );
    const released = await repository.transitionJob(
      queuedJob().jobId,
      "queued",
      "failed",
      new Date("2026-08-13T08:00:02.000Z"),
      { clearClaim: true },
    );
    expect(released).not.toHaveProperty("claimedBy");
    expect(released).not.toHaveProperty("claimedAt");
    expect(state.documents[0]).toMatchObject({
      claimState: "available",
      claimedBy: null,
      claimedAt: null,
    });
  });
});
