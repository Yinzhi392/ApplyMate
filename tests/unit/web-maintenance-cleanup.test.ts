import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRetirementInventory, createWebMaintenanceCleanup } = require("../../cloudfunctions/cleanup/deploy/web-maintenance-cleanup.js") as {
  createRetirementInventory(input: { database: Database; now(): Date }):
    (event: unknown) => Promise<Record<string, unknown>>;
  createWebMaintenanceCleanup(input: { database: Database; now(): Date }):
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
    const found = collections.get(name);
    if (found) return found;
    const created: Document[] = [];
    collections.set(name, created);
    return created;
  };
  return {
    documents,
    database: {
      collection(name: string) {
        return {
          where(query: Document) {
            const selected = () => documents(name).filter((item) => matches(item, query));
            return {
              limit(limit: number) {
                return { async get() { return { data: selected().slice(0, limit) }; } };
              },
              async update(update: Document) {
                const targets = selected();
                targets.forEach((item) => Object.assign(item, structuredClone(update)));
                return { updated: targets.length };
              },
              async remove() {
                const targets = new Set(selected());
                const kept = documents(name).filter((item) => !targets.has(item));
                collections.set(name, kept);
                return { deleted: targets.size };
              },
            };
          },
        };
      },
    },
  };
}

describe("Web maintenance cleanup", () => {
  it("fails stale jobs, releases quota, expires rewrite slots, and deletes requested accounts", async () => {
    const state = createDatabase();
    state.documents("users").push({
      _id: "user_delete", recordType: "user", userId: "user_delete",
      accountStatus: "disabled", deletionStatus: "pending",
    });
    state.documents("resumes").push({ _id: "resume_delete", userId: "user_delete" });
    state.documents("resumes").push({
      _id: "resume_draft", recordType: "resume", userId: "user_keep",
      status: "awaiting_confirmation", createdAt: "2026-08-20T01:00:00.000Z",
    });
    state.documents("audit_logs").push({
      _id: "audit_old", createdAt: "2026-01-01T00:00:00.000Z",
    });
    state.documents("ai_jobs").push({
      _id: "job_stale", recordType: "ai_job", jobId: "job_stale", userId: "user_keep",
      status: "queued", quotaReservationId: "quota_stale", createdAt: "2026-08-22T01:00:00.000Z",
    });
    state.documents("daily_usage").push(
      { _id: "quota_stale", userId: "user_keep", jobId: "job_stale", status: "reserved" },
      { _id: "rewrite_old", recordType: "web_rewrite_rate_slot", expiresAt: "2026-08-22T01:01:00.000Z" },
    );
    const cleanup = createWebMaintenanceCleanup({
      database: state.database,
      now: () => new Date("2026-08-22T01:20:00.000Z"),
    });
    await expect(cleanup({ webMaintenanceCleanup: true })).resolves.toEqual({
      ok: true,
      data: {
        releasedQuotaReservations: 1,
        deletedAccounts: 1,
        deletedRewriteSlots: 1,
        deletedDrafts: 1,
        deletedLogs: 1,
      },
    });
    expect(state.documents("ai_jobs")[0]).toMatchObject({ status: "failed", error: { code: "TASK_TIMEOUT" } });
    expect(state.documents("daily_usage")).toHaveLength(0);
    expect(state.documents("users")).toHaveLength(0);
    expect(state.documents("resumes")).toHaveLength(0);
  });

  it("returns a retirement deletion inventory without deleting anything", async () => {
    const state = createDatabase();
    state.documents("service_config").push({
      _id: "public",
      dataAccessEndsAt: "2027-03-01T00:00:00.000+08:00",
    });
    state.documents("users").push({ _id: "user_keep", userId: "user_keep" });
    const inventory = createRetirementInventory({
      database: state.database,
      now: () => new Date("2027-03-02T00:00:00.000Z"),
    });
    await expect(inventory({ retirementInventory: true })).resolves.toMatchObject({
      ok: true,
      data: {
        retired: true,
        deletionAuthorized: false,
        storageObjects: "REQUIRES_SEPARATE_STORAGE_INVENTORY",
        collections: { users: 1, service_config: 1 },
      },
    });
    expect(state.documents("users")).toHaveLength(1);
  });
});
