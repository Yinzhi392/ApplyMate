import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createLiveApiHandler, hashBootstrapToken } = require("../../cloudfunctions/api/deploy/live-api.js") as {
  createLiveApiHandler(input: {
    database: { collection(name: string): unknown };
    dispatchReliabilityProbe?(jobId: string): Promise<void>;
    readBootstrapTokenHash?(): string | undefined;
    readTrustedOpenId(): string | undefined;
    now(): Date;
  }): (event: unknown) => Promise<unknown>;
  hashBootstrapToken(token: string): string;
};

type StoredDocument = Record<string, unknown>;

function matches(document: StoredDocument, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

function createDatabase() {
  const collections = new Map<string, StoredDocument[]>();
  const documents = (name: string): StoredDocument[] => {
    const current = collections.get(name);
    if (current !== undefined) {
      return current;
    }
    const created: StoredDocument[] = [];
    collections.set(name, created);
    return created;
  };
  return {
    documents,
    database: {
      collection(name: string) {
        return {
          where(query: Record<string, unknown>) {
            return {
              limit() {
                return {
                  async get() {
                    return {
                      requestId: "database-get-request",
                      data: documents(name)
                        .filter((document) => matches(document, query))
                        .map((document) => structuredClone(document)),
                    };
                  },
                };
              },
              async update(update: Record<string, unknown>) {
                const target = documents(name).filter((document) => matches(document, query));
                for (const document of target) {
                  Object.assign(document, structuredClone(update));
                }
                return { requestId: "database-update-request", updated: target.length };
              },
            };
          },
          async add(document: StoredDocument) {
            if (documents(name).some((current) => current._id === document._id)) {
              throw new Error("duplicate document");
            }
            documents(name).push(structuredClone(document));
            return { id: String(document._id), requestId: "database-add-request" };
          },
          doc(id: string) {
            return {
              async update(update: Record<string, unknown>) {
                const document = documents(name).find((current) => current._id === id);
                if (document !== undefined) {
                  Object.assign(document, structuredClone(update));
                }
                return {
                  requestId: "database-update-request",
                  updated: document === undefined ? 0 : 1,
                };
              },
            };
          },
        };
      },
    },
  };
}

const AGREEMENTS = {
  userAgreementVersion: "user-2026-08-09",
  privacyPolicyVersion: "privacy-2026-08-09",
};
const ADMIN_REQUEST_ID = "a1234567-1234-4123-8123-123456789abc";
const USER_REQUEST_ID = "b1234567-1234-4123-8123-123456789abc";

function handlerFor(
  database: ReturnType<typeof createDatabase>["database"],
  trustedOpenId: string | undefined,
  bootstrapToken = "bootstrap-token-is-only-used-in-tests",
  dispatchReliabilityProbe: (jobId: string) => Promise<void> = async () => undefined,
) {
  return createLiveApiHandler({
    database,
    dispatchReliabilityProbe,
    readBootstrapTokenHash: () => hashBootstrapToken(bootstrapToken),
    readTrustedOpenId: () => trustedOpenId,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });
}

describe("CloudBase live identity and invite handler", () => {
  it("initializes an ordinary event cloud function without cloud-hosting context", async () => {
    const source = readFileSync("cloudfunctions/api/deploy/index.js", "utf8");
    const exportsObject: Record<string, unknown> = {};
    let initializationOptions: Record<string, unknown> | undefined;
    const database = { collection: () => ({}) };
    const defaultEnvironment = Symbol("default-environment");
    const invocationContext = { extendedContext: "runtime-context" };

    runInNewContext(source, {
      exports: exportsObject,
      process: {
        env: {
          TCB_ENV: "applymate-test-environment",
          WX_OPENID: "trusted-open-id",
        },
      },
      require(moduleId: string) {
        if (moduleId === "@cloudbase/js-sdk") {
          return {
            SYMBOL_DEFAULT_ENV: defaultEnvironment,
            getCloudbaseContext(receivedContext: unknown) {
              expect(receivedContext).toBe(invocationContext);
              return {
                TCB_ENV: "applymate-runtime-environment",
                TENCENTCLOUD_SECRETID: "temporary-secret-id",
                TENCENTCLOUD_SECRETKEY: "temporary-secret-key",
                TENCENTCLOUD_SESSIONTOKEN: "temporary-session-token",
              };
            },
            init(options: Record<string, unknown>) {
              initializationOptions = options;
              return { database: () => database };
            },
          };
        }
        if (moduleId === "./live-api") {
          return {
            createLiveApiHandler: () => async () => ({ ok: true }),
          };
        }
        if (moduleId === "./scf-async-invoker") {
          return {
            createScfAsyncInvoker: () => async () => ({
              ok: true,
              data: { accepted: true },
            }),
          };
        }
        throw new Error(`Unexpected module: ${moduleId}`);
      },
    });

    const main = exportsObject.main as (event: unknown, context: unknown) => Promise<unknown>;
    await expect(main({ action: "auth.status", payload: {} }, invocationContext))
      .resolves.toEqual({ ok: true });
    expect(initializationOptions).toEqual({
      env: defaultEnvironment,
    });
  });

  it("fails closed when CloudBase returns a database error object", async () => {
    const handler = createLiveApiHandler({
      database: {
        collection() {
          return {
            where() {
              return {
                limit() {
                  return {
                    async get() {
                      return { code: "DATABASE_AUTH_FAILED", message: "denied" };
                    },
                  };
                },
              };
            },
          };
        },
      },
      readTrustedOpenId: () => "wx_database_error",
      now: () => new Date("2026-08-11T12:00:00.000Z"),
    });

    await expect(handler({ action: "auth.status", payload: {} })).rejects.toThrow(
      "CloudBase database get failed (DATABASE_AUTH_FAILED).",
    );
  });

  it("derives identity only from trusted context and persists agreement acceptance", async () => {
    const state = createDatabase();
    const handler = handlerFor(state.database, "wx_trusted_identity");

    await expect(
      handler({ action: "auth.status", payload: {}, openId: "forged" }),
    ).resolves.toMatchObject({ ok: true, data: { accessState: "agreement_required" } });
    expect(state.documents("users")).toHaveLength(1);
    expect(JSON.stringify(state.documents("users")[0])).not.toContain("wx_trusted_identity");

    await expect(handler({ action: "agreement.accept", payload: AGREEMENTS })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "invite_required" },
    });
    await expect(handler({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { user: { preferenceText: "", remainingQuota: 5 } },
    });
  });

  it("bootstraps exactly one trusted administrator after agreement acceptance", async () => {
    const state = createDatabase();
    const owner = handlerFor(state.database, "wx_owner");
    const other = handlerFor(state.database, "wx_other");

    await owner({ action: "agreement.accept", payload: AGREEMENTS });
    await expect(owner({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: ADMIN_REQUEST_ID,
    })).resolves.toMatchObject({ ok: true, data: { bootstrapped: true, isAdmin: true } });
    await expect(owner({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active", isAdmin: true },
    });

    await other({ action: "agreement.accept", payload: AGREEMENTS });
    await expect(other({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: USER_REQUEST_ID,
    })).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(state.documents("audit_logs")).toHaveLength(1);
  });

  it("creates a hashed invitation and activates only its claimant", async () => {
    const state = createDatabase();
    const admin = handlerFor(state.database, "wx_admin");
    const candidate = handlerFor(state.database, "wx_candidate");
    const attacker = handlerFor(state.database, "wx_attacker");
    await admin({ action: "agreement.accept", payload: AGREEMENTS });
    await admin({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: ADMIN_REQUEST_ID,
    });
    const invitation = await admin({
      action: "admin.inviteCreate",
      payload: {},
      requestId: "c1234567-1234-4123-8123-123456789abc",
    }) as { ok: true; data: { code: string; inviteId: string } };
    expect(invitation.ok).toBe(true);
    expect(JSON.stringify(state.documents("invites")[0])).not.toContain(invitation.data.code);

    await candidate({ action: "agreement.accept", payload: AGREEMENTS });
    await attacker({ action: "agreement.accept", payload: AGREEMENTS });
    await expect(attacker({
      action: "invite.activate",
      payload: { code: "AM-NOT-A-VALID-INVITATION" },
      requestId: "d1234567-1234-4123-8123-123456789abc",
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    await expect(candidate({
      action: "invite.activate",
      payload: { code: invitation.data.code },
      requestId: USER_REQUEST_ID,
    })).resolves.toMatchObject({ ok: true, data: { accessState: "active" } });
    await expect(attacker({
      action: "invite.activate",
      payload: { code: invitation.data.code },
      requestId: "e1234567-1234-4123-8123-123456789abc",
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("rejects missing trusted identity and keeps unrelated capabilities paused", async () => {
    const state = createDatabase();
    const handler = handlerFor(state.database, undefined);
    await expect(handler({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });

    const authenticated = handlerFor(state.database, "wx_live_only");
    await expect(authenticated({ action: "resume.parse", payload: {} })).resolves.toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PAUSED", retryable: true },
    });
  });

  it("returns only the current user's safe job projection", async () => {
    const state = createDatabase();
    const user = handlerFor(state.database, "wx_job_owner");
    const other = handlerFor(state.database, "wx_job_other");
    await user({ action: "agreement.accept", payload: AGREEMENTS });
    await user({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: ADMIN_REQUEST_ID,
    });
    await other({ action: "agreement.accept", payload: AGREEMENTS });

    const owner = state.documents("users").find((document) =>
      Array.isArray(document.roles) && document.roles.includes("admin"),
    );
    const otherUser = state.documents("users").find((document) => document.userId !== owner?.userId);
    if (otherUser !== undefined) {
      otherUser.activationStatus = "active";
    }
    const timestamp = "2026-08-11T12:00:00.000Z";
    state.documents("ai_jobs").push({
      _id: "job_synthetic_live_001",
      recordType: "ai_job",
      claimState: "claimed",
      jobId: "job_synthetic_live_001",
      userId: owner?.userId,
      kind: "resume_parse",
      status: "parsing",
      statusHistory: [{ status: "queued", enteredAt: timestamp }],
      claimedBy: "worker_internal_identifier",
      claimedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const result = await user({
      action: "job.get",
      payload: { jobId: "job_synthetic_live_001" },
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        jobId: "job_synthetic_live_001",
        kind: "resume_parse",
        status: "parsing",
        statusLabel: "解析",
      },
    });
    expect(result).not.toHaveProperty("data.claimedBy");
    await expect(
      other({ action: "job.get", payload: { jobId: "job_synthetic_live_001" } }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await expect(
      user({ action: "job.get", payload: { jobId: "invalid" } }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("creates only administrator-owned synthetic reliability probes idempotently", async () => {
    const state = createDatabase();
    const dispatched: string[] = [];
    const admin = handlerFor(
      state.database,
      "wx_probe_admin",
      "bootstrap-token-is-only-used-in-tests",
      async (jobId) => { dispatched.push(jobId); },
    );
    await admin({ action: "agreement.accept", payload: AGREEMENTS });
    await admin({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: ADMIN_REQUEST_ID,
    });
    const request = {
      action: "admin.reliabilityProbeCreate",
      payload: { scenario: "success" },
      requestId: "f1234567-1234-4123-8123-123456789abc",
    };
    const first = await admin(request) as { ok: true; data: { jobId: string } };
    const second = await admin(request) as { ok: true; data: { jobId: string } };

    expect(first.data.jobId).toMatch(/^job_probe_[a-f0-9]{24}$/u);
    expect(second.data.jobId).toBe(first.data.jobId);
    expect(state.documents("ai_jobs")).toHaveLength(1);
    expect(state.documents("ai_jobs")[0]).toMatchObject({
      kind: "reliability_probe",
      syntheticTest: true,
      status: "queued",
    });
    expect(state.documents("daily_usage")).toHaveLength(1);
    expect(dispatched).toEqual([first.data.jobId, first.data.jobId]);
  });

  it("seeds an administrator-owned synthetic deletion probe in exactly eight collections", async () => {
    const state = createDatabase();
    const admin = handlerFor(state.database, "wx_deletion_probe_admin");
    const ordinaryUser = handlerFor(state.database, "wx_deletion_probe_user");
    await admin({ action: "agreement.accept", payload: AGREEMENTS });
    await admin({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: ADMIN_REQUEST_ID,
    });
    await ordinaryUser({ action: "agreement.accept", payload: AGREEMENTS });
    const request = {
      action: "admin.syntheticDeletionProbeCreate",
      payload: {},
      requestId: "91234567-1234-4123-8123-123456789abc",
    };

    await expect(ordinaryUser(request)).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    const first = await admin(request) as { ok: true; data: { probeId: string } };
    const second = await admin(request) as { ok: true; data: { probeId: string } };

    expect(first.data.probeId).toMatch(/^delete_probe_[a-f0-9]{24}$/u);
    expect(second.data.probeId).toBe(first.data.probeId);
    const collectionNames = [
      "users", "invites", "resumes", "applications", "ai_jobs", "daily_usage", "feedback",
      "audit_logs",
    ];
    for (const collectionName of collectionNames) {
      expect(state.documents(collectionName).filter((document) =>
        document.deletionProbeId === first.data.probeId,
      )).toHaveLength(1);
      expect(state.documents(collectionName).find((document) =>
        document.deletionProbeId === first.data.probeId,
      )).toMatchObject({
        recordType: "synthetic_deletion_probe",
        syntheticTest: true,
        collectionName,
      });
    }
  });
});
