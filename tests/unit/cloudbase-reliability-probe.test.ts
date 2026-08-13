import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createReliabilityWorker } = require("../../cloudfunctions/worker/deploy/reliability-worker.js") as {
  createReliabilityWorker(input: { database: Database; now?(): Date }):
    (event: unknown) => Promise<Record<string, unknown>>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createReliabilityCleanup } = require("../../cloudfunctions/cleanup/deploy/reliability-cleanup.js") as {
  createReliabilityCleanup(input: { database: Database; now?(): Date }):
    (event: unknown) => Promise<Record<string, unknown>>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSyntheticAccountDeletion } = require("../../cloudfunctions/cleanup/deploy/synthetic-account-deletion.js") as {
  createSyntheticAccountDeletion(input: { database: Database; now?(): Date }):
    (event: unknown) => Promise<Record<string, unknown>>;
};

type Document = Record<string, unknown>;
type Collection = ReturnType<typeof createDatabase>["database"]["collection"] extends
  (name: string) => infer Result ? Result : never;
interface Database { collection(name: string): Collection }

function matches(document: Document, query: Document): boolean {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

function createDatabase() {
  const collections = new Map<string, Document[]>();
  const documents = (name: string): Document[] => {
    const existing = collections.get(name);
    if (existing) return existing;
    const created: Document[] = [];
    collections.set(name, created);
    return created;
  };
  return {
    documents,
    database: {
      collection(name: string) {
        return {
          async add(document: Document) {
            if (documents(name).some((current) => current._id === document._id)) {
              throw new Error("duplicate document");
            }
            documents(name).push(structuredClone(document));
            return { id: String(document._id) };
          },
          where(query: Document) {
            const selected = () => documents(name).filter((document) => matches(document, query));
            return {
              limit(limit: number) {
                return {
                  async get() {
                    return { data: selected().slice(0, limit).map((document) => structuredClone(document)) };
                  },
                };
              },
              async update(update: Document) {
                const targets = selected();
                targets.forEach((document) => Object.assign(document, structuredClone(update)));
                return { updated: targets.length };
              },
              async remove() {
                const before = documents(name).length;
                collections.set(name, documents(name).filter((document) => !matches(document, query)));
                return { deleted: before - documents(name).length };
              },
            };
          },
        };
      },
    },
  };
}

function seedProbe(state: ReturnType<typeof createDatabase>, updatedAt: string) {
  const jobId = "job_probe_0123456789abcdef01234567";
  state.documents("ai_jobs").push({
    _id: jobId,
    recordType: "ai_job",
    claimState: "available",
    jobId,
    userId: "user_synthetic_admin",
    kind: "reliability_probe",
    syntheticTest: true,
    scenario: "success",
    status: "queued",
    statusHistory: [{ status: "queued", enteredAt: updatedAt }],
    createdAt: updatedAt,
    updatedAt,
  });
  state.documents("daily_usage").push({
    _id: "probe_usage_0123456789abcdef01234567",
    recordType: "reliability_probe_usage",
    jobId,
    syntheticTest: true,
    reserved: 1,
    succeeded: 0,
    createdAt: updatedAt,
    updatedAt,
  });
  return jobId;
}

describe("CloudBase synthetic reliability probe", () => {
  it("runs the real worker state machine and settles only synthetic usage", async () => {
    const state = createDatabase();
    const jobId = seedProbe(state, "2026-08-13T08:00:00.000Z");
    const worker = createReliabilityWorker({
      database: state.database,
      now: () => new Date("2026-08-13T08:00:01.000Z"),
    });

    await expect(worker({ jobId })).resolves.toMatchObject({
      ok: true,
      data: { jobId, status: "succeeded", replayed: false },
    });
    expect(state.documents("ai_jobs")[0]).toMatchObject({ status: "succeeded" });
    expect(state.documents("daily_usage")[0]).toMatchObject({ reserved: 0, succeeded: 1 });
    await expect(worker({ jobId })).resolves.toMatchObject({
      ok: true,
      data: { status: "succeeded", replayed: true },
    });
  });

  it("recovers only stale synthetic probes and releases their reservation", async () => {
    const state = createDatabase();
    const jobId = seedProbe(state, "2026-08-13T07:48:59.000Z");
    state.documents("ai_jobs").push({
      _id: "job_real_untouched",
      recordType: "ai_job",
      jobId: "job_real_untouched",
      kind: "resume_parse",
      syntheticTest: false,
      status: "queued",
      updatedAt: "2026-08-13T07:00:00.000Z",
    });
    const cleanup = createReliabilityCleanup({
      database: state.database,
      now: () => new Date("2026-08-13T08:00:00.000Z"),
    });

    await expect(cleanup({ reliabilityProbeCleanup: true })).resolves.toEqual({
      ok: true,
      data: { scanned: 1, recovered: 1 },
    });
    expect(state.documents("ai_jobs").find((job) => job.jobId === jobId)).toMatchObject({
      status: "failed",
      error: { code: "TASK_TIMEOUT" },
    });
    expect(state.documents("daily_usage")[0]).toMatchObject({ reserved: 0, succeeded: 0 });
    expect(state.documents("ai_jobs").find((job) => job.jobId === "job_real_untouched"))
      .toMatchObject({ status: "queued" });
  });

  it("rejects arbitrary worker and cleanup traffic", async () => {
    const state = createDatabase();
    const worker = createReliabilityWorker({ database: state.database });
    const cleanup = createReliabilityCleanup({ database: state.database });
    await expect(worker({ jobId: "job_real_untouched" })).resolves.toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PAUSED" },
    });
    await expect(cleanup({ action: "user.delete" })).resolves.toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PAUSED" },
    });
  });

  it("deletes only an exact synthetic account probe and keeps a non-linkable aggregate", async () => {
    const state = createDatabase();
    const probeId = "delete_probe_0123456789abcdef01234567";
    const collectionNames = [
      "users", "invites", "resumes", "applications", "ai_jobs", "daily_usage", "feedback",
      "audit_logs",
    ];
    for (const collectionName of collectionNames) {
      state.documents(collectionName).push({
        _id: `${probeId}_${collectionName}`,
        recordType: "synthetic_deletion_probe",
        deletionProbeId: probeId,
        userId: "user_delete_probe_0123456789abcdef01234567",
        syntheticTest: true,
      });
      state.documents(collectionName).push({
        _id: `real_${collectionName}`,
        recordType: "user_data",
        userId: "user_delete_probe_0123456789abcdef01234567",
        syntheticTest: false,
      });
    }
    const cleanup = createSyntheticAccountDeletion({
      database: state.database,
      now: () => new Date("2026-08-13T10:00:00.000Z"),
    });

    const first = await cleanup({ syntheticAccountDeletionCleanup: true, probeId }) as {
      ok: true;
      data: {
        deleted: Record<string, number>;
        remaining: Record<string, number>;
        aggregateCreated: boolean;
        aggregateReconciled: boolean;
        aggregateCount: number;
        aggregateContainsUserId: boolean;
      };
    };
    expect(first.ok).toBe(true);
    expect(first.data.deleted).toEqual(Object.fromEntries(collectionNames.map((name) => [name, 1])));
    expect(first.data.remaining).toEqual(Object.fromEntries(collectionNames.map((name) => [name, 0])));
    expect(first.data.aggregateCreated).toBe(true);
    expect(first.data.aggregateReconciled).toBe(false);
    expect(first.data.aggregateCount).toBe(1);
    expect(first.data.aggregateContainsUserId).toBe(false);
    for (const collectionName of collectionNames) {
      expect(state.documents(collectionName)).toContainEqual(expect.objectContaining({
        _id: `real_${collectionName}`,
      }));
    }
    const aggregate = state.documents("daily_usage").find((document) =>
      document.recordType === "anonymous_account_deletion_metric",
    );
    expect(aggregate).toBeDefined();
    expect(aggregate).not.toHaveProperty("userId");
    expect(aggregate).not.toHaveProperty("deletionProbeId");

    const replay = await cleanup({ syntheticAccountDeletionCleanup: true, probeId }) as {
      ok: true;
      data: {
        deleted: Record<string, number>;
        aggregateCreated: boolean;
        aggregateReconciled: boolean;
        aggregateCount: number;
      };
    };
    expect(replay.data.deleted).toEqual(Object.fromEntries(collectionNames.map((name) => [name, 0])));
    expect(replay.data.aggregateCreated).toBe(false);
    expect(replay.data.aggregateReconciled).toBe(false);
    expect(replay.data.aggregateCount).toBe(1);
  });

  it("reconciles duplicate anonymous aggregates created by CloudBase add semantics", async () => {
    const state = createDatabase();
    const probeId = "delete_probe_0123456789abcdef01234567";
    const aggregate = {
      _id: "anonymous_deletion_0123456789abcdef01234567",
      recordType: "anonymous_account_deletion_metric",
      syntheticTest: true,
      count: 1,
    };
    state.documents("daily_usage").push(
      { ...aggregate, cloudDocumentId: "first" },
      { ...aggregate, cloudDocumentId: "second" },
    );
    const cleanup = createSyntheticAccountDeletion({ database: state.database });

    await expect(cleanup({ syntheticAccountDeletionCleanup: true, probeId })).resolves.toMatchObject({
      ok: true,
      data: {
        aggregateCreated: false,
        aggregateReconciled: true,
        aggregateCount: 1,
        aggregateContainsUserId: false,
      },
    });
  });

  it("rejects malformed synthetic account deletion targets", async () => {
    const state = createDatabase();
    const cleanup = createSyntheticAccountDeletion({ database: state.database });
    await expect(cleanup({
      syntheticAccountDeletionCleanup: true,
      probeId: "user_real_account",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PAUSED" },
    });
  });
});
