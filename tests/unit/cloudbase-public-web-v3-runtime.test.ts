import { describe, expect, it } from "vitest";

import {
  MONTHLY_BUDGET_LIMIT_FEN,
  MONTHLY_BUDGET_STOP_FEN,
  MONTHLY_BUDGET_WARNING_FEN,
} from "../../cloudfunctions/api/src/ai-task-admission-service";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtime = require("../../cloudfunctions/api/deploy/public-web-v3-runtime.js") as {
  BUDGET_LIMIT_FEN: number;
  BUDGET_STOP_FEN: number;
  BUDGET_WARNING_FEN: number;
  assertPublicAction(action: string, access: ServiceAccess): void;
  exportUserPage(database: FakeDatabase, userId: string, payload: unknown, now: Date): Promise<Record<string, unknown>>;
  loadPublicWebRuntime(database: FakeDatabase, now: Date, experienceEnabled: boolean): Promise<{
    access: ServiceAccess;
    budget: { exposureFen: number; state: string } | null;
  }>;
  reserveGenerationTransaction(input: {
    database: FakeDatabase;
    estimatedCostFen: number;
    jobDocument: Record<string, unknown>;
    now: Date;
    userId: string;
  }): Promise<{ created: boolean; admissionId: string }>;
};

interface ServiceAccess {
  phase: "active" | "read_only" | "retired";
  aiAvailability: "available" | "budget_paused" | "scheduled_closed" | "resource_paused";
  aiClosesAt: string;
  dataAccessEndsAt: string;
}

type Document = Record<string, unknown>;

function matches(document: Document, query: Document): boolean {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

function cloneCollections(source: Map<string, Document[]>): Map<string, Document[]> {
  return new Map(Array.from(source, ([name, documents]) => [name, structuredClone(documents)]));
}

interface FakeDatabase {
  collection(name: string): ReturnType<typeof collectionFor>;
  runTransaction<T>(callback: (transaction: FakeDatabase) => Promise<T>): Promise<T>;
}

function collectionFor(collections: Map<string, Document[]>, name: string) {
  const documents = (): Document[] => {
    const existing = collections.get(name);
    if (existing !== undefined) return existing;
    const created: Document[] = [];
    collections.set(name, created);
    return created;
  };
  return {
    where(query: Document) {
      return {
        limit(limit: number) {
          return {
            async get() {
              return { data: documents().filter((document) => matches(document, query)).slice(0, limit) };
            },
          };
        },
      };
    },
    doc(id: string) {
      return {
        async create(document: Document) {
          if (documents().some((current) => current._id === id)) throw new Error("duplicate");
          documents().push(structuredClone(document));
          return { inserted: 1 };
        },
        async delete() {
          const index = documents().findIndex((document) => document._id === id);
          if (index >= 0) documents().splice(index, 1);
          return { deleted: index >= 0 ? 1 : 0 };
        },
        async get() {
          return { data: structuredClone(documents().find((document) => document._id === id) ?? null) };
        },
        async update(update: Document) {
          const document = documents().find((current) => current._id === id);
          if (document !== undefined) Object.assign(document, structuredClone(update));
          return { updated: document === undefined ? 0 : 1 };
        },
      };
    },
  };
}

function createDatabase(seed: Record<string, Document[]>): { database: FakeDatabase; documents(name: string): Document[] } {
  let collections = new Map(Object.entries(structuredClone(seed)));
  const database: FakeDatabase = {
    collection(name: string) {
      return collectionFor(collections, name);
    },
    async runTransaction<T>(callback: (transaction: FakeDatabase) => Promise<T>) {
      const snapshot = cloneCollections(collections);
      const transaction: FakeDatabase = {
        collection(name: string) {
          return collectionFor(snapshot, name);
        },
        runTransaction: database.runTransaction,
      };
      const result = await callback(transaction);
      collections = snapshot;
      return result;
    },
  };
  return { database, documents: (name) => collections.get(name) ?? [] };
}

const NOW = new Date("2026-09-15T04:00:00.000Z");
const ACTIVE_ACCESS: ServiceAccess = {
  phase: "active",
  aiAvailability: "available",
  aiClosesAt: "2026-11-01T00:00:00.000+08:00",
  dataAccessEndsAt: "2027-03-01T00:00:00.000+08:00",
};

function configuredSeed(): Record<string, Document[]> {
  return {
    service_config: [{
      _id: "public",
      publicLaunchAt: "2026-09-01T00:00:00.000+08:00",
      aiClosesAt: ACTIVE_ACCESS.aiClosesAt,
      dataAccessEndsAt: ACTIVE_ACCESS.dataAccessEndsAt,
      estimatedAiTaskCostFen: 8,
      resourcePaused: false,
    }],
    budget_periods: [{
      _id: "budget_2026-09",
      recordType: "budget_period",
      limitFen: 10_000,
      warningFen: 8_000,
      stopFen: 9_000,
      fixedCostFen: 1_990,
      conservativeSettledFen: 200,
      reservedFen: 50,
      officialBilledFen: 180,
    }],
  };
}

describe("CloudBase public Web v3 runtime", () => {
  it("keeps the deploy adapter budget constants aligned with the strict TypeScript policy", () => {
    expect({
      limit: runtime.BUDGET_LIMIT_FEN,
      stop: runtime.BUDGET_STOP_FEN,
      warning: runtime.BUDGET_WARNING_FEN,
    }).toEqual({
      limit: MONTHLY_BUDGET_LIMIT_FEN,
      stop: MONTHLY_BUDGET_STOP_FEN,
      warning: MONTHLY_BUDGET_WARNING_FEN,
    });
  });

  it("loads the immutable schedule and budget, and rejects removed actions", async () => {
    const { database } = createDatabase(configuredSeed());
    const state = await runtime.loadPublicWebRuntime(database, NOW, true);
    expect(state.access).toEqual(ACTIVE_ACCESS);
    expect(state.budget).toMatchObject({ exposureFen: 2_240, state: "normal" });
    expect(() => runtime.assertPublicAction("generation.rewrite", state.access))
      .toThrow("not part of the public Web product");
    expect(() => runtime.assertPublicAction("generation.create", { ...state.access, phase: "read_only" }))
      .toThrow("read-only");
    expect(() => runtime.assertPublicAction("resume.parse", { ...state.access, aiAvailability: "resource_paused" }))
      .toThrow("unavailable");
  });

  it("reserves budget, successful-use slot and job atomically, then replays idempotently", async () => {
    const fixture = createDatabase(configuredSeed());
    const jobDocument = {
      _id: "job_generation_12345678",
      recordType: "ai_job",
      jobId: "job_generation_12345678",
      userId: "user_a",
      status: "queued",
      createdAt: NOW.toISOString(),
    };
    const first = await runtime.reserveGenerationTransaction({
      database: fixture.database,
      estimatedCostFen: 8,
      jobDocument,
      now: NOW,
      userId: "user_a",
    });
    const replay = await runtime.reserveGenerationTransaction({
      database: fixture.database,
      estimatedCostFen: 8,
      jobDocument,
      now: NOW,
      userId: "user_a",
    });
    expect(first).toMatchObject({ created: true, admissionId: "admission_job_generation_12345678" });
    expect(replay).toMatchObject({ created: false, admissionId: first.admissionId });
    expect(fixture.documents("ai_jobs")).toHaveLength(1);
    expect(fixture.documents("ai_task_admissions")).toHaveLength(1);
    expect(fixture.documents("daily_usage")).toHaveLength(1);
    expect(fixture.documents("budget_periods")[0]?.reservedFen).toBe(58);
  });

  it("exports only owned versioned records and recursively removes identity material", async () => {
    const fixture = createDatabase({
      users: [{ _id: "user_a", userId: "user_a", identityHash: "secret", profile: { EMAIL: "hidden" } }],
      resumes: [
        { _id: "resume_a", userId: "user_a", title: "safe" },
        { _id: "resume_b", userId: "user_b", title: "other" },
      ],
      applications: [],
      ai_jobs: [],
      feedback: [],
    });
    const page = await runtime.exportUserPage(fixture.database, "user_a", { limit: 20 }, NOW);
    expect(page).toMatchObject({ version: "applymate-user-export-v1", nextCursor: null });
    expect(JSON.stringify(page)).not.toMatch(/secret|hidden|identityHash|userId/u);
    expect(JSON.stringify(page)).toContain("safe");
    expect(JSON.stringify(page)).not.toContain("other");
  });
});
