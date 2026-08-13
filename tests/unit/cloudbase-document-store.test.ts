import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  addIfAbsent,
  assertDatabaseResult,
  findOne,
  updateExactlyOne,
} = require("../../cloudfunctions/api/deploy/cloudbase-document-store.js") as {
  addIfAbsent(collection: unknown, document: Record<string, unknown>): Promise<boolean>;
  assertDatabaseResult(result: unknown, operation: string): Record<string, unknown>;
  findOne(collection: unknown, query: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  updateExactlyOne(target: unknown, update: Record<string, unknown>): Promise<boolean>;
};

type StoredDocument = Record<string, unknown>;

function matches(document: StoredDocument, query: StoredDocument): boolean {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

function createCollection(initial: StoredDocument[] = []) {
  const documents = initial.map((document) => structuredClone(document));
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

describe("CloudBase document store", () => {
  it("reads one matching document without exposing the stored object", async () => {
    const state = createCollection([{ _id: "one", status: "queued" }]);
    const result = await findOne(state.collection, { status: "queued" });
    expect(result).toEqual({ _id: "one", status: "queued" });
    result!.status = "changed-locally";
    expect(state.documents[0]?.status).toBe("queued");
  });

  it("creates a deterministic document once and replays concurrent duplicates", async () => {
    const state = createCollection();
    await expect(addIfAbsent(state.collection, { _id: "stable", value: 1 })).resolves.toBe(true);
    await expect(addIfAbsent(state.collection, { _id: "stable", value: 2 })).resolves.toBe(false);
    expect(state.documents).toEqual([{ _id: "stable", value: 1 }]);
  });

  it("reports whether a compare-and-set query changed exactly one document", async () => {
    const state = createCollection([{ _id: "job", status: "queued" }]);
    await expect(
      updateExactlyOne(state.collection.where({ _id: "job", status: "queued" }), {
        status: "parsing",
      }),
    ).resolves.toBe(true);
    await expect(
      updateExactlyOne(state.collection.where({ _id: "job", status: "queued" }), {
        status: "failed",
      }),
    ).resolves.toBe(false);
    expect(state.documents[0]?.status).toBe("parsing");
  });

  it("fails closed for CloudBase error and malformed response objects", () => {
    expect(() => assertDatabaseResult({ code: "DATABASE_AUTH_FAILED" }, "get")).toThrow(
      "CloudBase database get failed (DATABASE_AUTH_FAILED).",
    );
    expect(() => assertDatabaseResult(null, "update")).toThrow(
      "CloudBase database update returned an invalid response.",
    );
  });
});
