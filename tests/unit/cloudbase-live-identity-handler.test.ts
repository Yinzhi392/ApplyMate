import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createLiveApiHandler, hashBootstrapToken, hashTrustedIdentity, stripClientIdentity } = require("../../cloudfunctions/api/deploy/live-api.js") as {
  createLiveApiHandler(input: {
    database: { collection(name: string): unknown };
    dispatchReliabilityProbe?(jobId: string): Promise<void>;
    publicWebV3?: boolean;
    readBootstrapTokenHash?(): string | undefined;
    readTrustedIdentity?(): Promise<{ value: string; namespace: string } | null>;
    readTrustedOpenId?(): string | undefined;
    now(): Date;
  }): (event: unknown) => Promise<unknown>;
  hashBootstrapToken(token: string): string;
  hashTrustedIdentity(identity: string, namespace: string): string;
  stripClientIdentity(value: unknown): unknown;
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
  userAgreementVersion: "user-2026-08-23",
  privacyPolicyVersion: "privacy-2026-08-23",
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

function emailHandlerFor(
  database: ReturnType<typeof createDatabase>["database"],
  uid: string,
) {
  return createLiveApiHandler({
    database,
    readTrustedIdentity: async () => ({ value: uid, namespace: "web-email-uid-v1" }),
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  });
}

function anonymousWebHandlerFor(
  database: ReturnType<typeof createDatabase>["database"],
  uid: string,
) {
  return createLiveApiHandler({
    database,
    readTrustedIdentity: async () => ({ value: uid, namespace: "web-anonymous-uid-v1" }),
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  });
}

describe("CloudBase live identity and invite handler", () => {
  it("domain-separates anonymous identities and recursively ignores forged client identity", () => {
    expect(hashTrustedIdentity("same", "web-anonymous-uid-v1"))
      .not.toBe(hashTrustedIdentity("same", "applymate-openid-v1"));
    expect(stripClientIdentity({
      userId: "forged-envelope",
      payload: {
        uid: "forged-payload",
        nested: { OPENID: "forged", EmailAddress: "forged@example.com", OWNERID: "forged", keep: true },
      },
    })).toEqual({ payload: { nested: { keep: true } } });
  });

  it("accepts only a trusted email UID when public Web v3 mode is enabled", async () => {
    const anonymousStore = createDatabase();
    const anonymous = createLiveApiHandler({
      database: anonymousStore.database,
      publicWebV3: true,
      readTrustedIdentity: async () => ({ value: "anonymous-a", namespace: "web-anonymous-uid-v1" }),
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    });
    await expect(anonymous({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });

    const emailStore = createDatabase();
    const email = createLiveApiHandler({
      database: emailStore.database,
      publicWebV3: true,
      readTrustedIdentity: async () => ({ value: "email-a", namespace: "web-email-uid-v1" }),
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    });
    await expect(email({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: {
        serviceAccess: { phase: "read_only", aiAvailability: "resource_paused" },
      },
    });
  });

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

  it("keeps an explicitly anonymous Web UID in the Legacy namespace", async () => {
    const source = readFileSync("cloudfunctions/api/deploy/index.js", "utf8");
    const exportsObject: Record<string, unknown> = {};
    const invocationContext = { extendedContext: "runtime-context" };

    runInNewContext(source, {
      exports: exportsObject,
      process: { env: {} },
      require(moduleId: string) {
        if (moduleId === "@cloudbase/js-sdk") {
          return {
            SYMBOL_DEFAULT_ENV: Symbol("default-environment"),
            getCloudbaseContext(receivedContext: unknown) {
              expect(receivedContext).toBe(invocationContext);
              return {
                TCB_ENV: "applymate-runtime-environment",
                TCB_UUID: "anonymous-runtime-uid",
                isAnonymous: true,
              };
            },
            init() {
              return {
                auth: { async getUserInfo() { return null; } },
                database: () => ({ collection: () => ({}) }),
              };
            },
          };
        }
        if (moduleId === "./live-api") {
          return {
            createLiveApiHandler: (options: {
              readTrustedIdentity(): Promise<{ value: string; namespace: string } | null>;
            }) => async () => options.readTrustedIdentity(),
          };
        }
        if (moduleId === "./scf-async-invoker") {
          return { createScfAsyncInvoker: () => async () => ({ ok: true }) };
        }
        throw new Error(`Unexpected module: ${moduleId}`);
      },
    });

    const main = exportsObject.main as (event: unknown, context: unknown) => Promise<unknown>;
    await expect(main({ action: "auth.status", payload: {} }, invocationContext))
      .resolves.toEqual({
        value: "anonymous-runtime-uid",
        namespace: "web-anonymous-uid-v1",
      });
  });

  it("treats a Web UID without an anonymous marker as the configured email identity", async () => {
    const source = readFileSync("cloudfunctions/api/deploy/index.js", "utf8");
    const exportsObject: Record<string, unknown> = {};

    runInNewContext(source, {
      exports: exportsObject,
      process: { env: {} },
      require(moduleId: string) {
        if (moduleId === "@cloudbase/js-sdk") {
          return {
            SYMBOL_DEFAULT_ENV: Symbol("default-environment"),
            getCloudbaseContext() {
              return { TCB_UUID: "registered-email-without-runtime-marker" };
            },
            init() {
              return {
                auth: { async getUserInfo() { return null; } },
                database: () => ({ collection: () => ({}) }),
              };
            },
          };
        }
        if (moduleId === "./live-api") {
          return {
            createLiveApiHandler: (options: {
              readTrustedIdentity(): Promise<{ value: string; namespace: string } | null>;
            }) => async () => options.readTrustedIdentity(),
          };
        }
        if (moduleId === "./scf-async-invoker") {
          return { createScfAsyncInvoker: () => async () => ({ ok: true }) };
        }
        throw new Error(`Unexpected module: ${moduleId}`);
      },
    });

    const main = exportsObject.main as (event: unknown, context: unknown) => Promise<unknown>;
    await expect(main({ action: "auth.status", payload: {} }, {})).resolves.toEqual({
      value: "registered-email-without-runtime-marker",
      namespace: "web-email-uid-v1",
    });
  });

  it("classifies a registered email caller from trusted CloudBase context", async () => {
    const source = readFileSync("cloudfunctions/api/deploy/index.js", "utf8");
    const exportsObject: Record<string, unknown> = {};

    runInNewContext(source, {
      exports: exportsObject,
      process: { env: {} },
      require(moduleId: string) {
        if (moduleId === "@cloudbase/js-sdk") {
          return {
            SYMBOL_DEFAULT_ENV: Symbol("default-environment"),
            getCloudbaseContext() {
              return { TCB_UUID: "registered-email-uid", isAnonymous: false };
            },
            init() {
              return {
                auth: { async getUserInfo() { return null; } },
                database: () => ({ collection: () => ({}) }),
              };
            },
          };
        }
        if (moduleId === "./live-api") {
          return {
            createLiveApiHandler: (options: {
              readTrustedIdentity(): Promise<{ value: string; namespace: string } | null>;
            }) => async () => options.readTrustedIdentity(),
          };
        }
        if (moduleId === "./scf-async-invoker") {
          return { createScfAsyncInvoker: () => async () => ({ ok: true }) };
        }
        throw new Error(`Unexpected module: ${moduleId}`);
      },
    });

    const main = exportsObject.main as (event: unknown, context: unknown) => Promise<unknown>;
    await expect(main({ action: "auth.status", payload: {} }, {})).resolves.toEqual({
      value: "registered-email-uid",
      namespace: "web-email-uid-v1",
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

  it("derives an ordinary mini-program identity only from trusted context", async () => {
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
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("activates an explicitly anonymous Web identity after agreement without an invitation", async () => {
    const state = createDatabase();
    const handler = anonymousWebHandlerFor(state.database, "anonymous-web-identity-uid");

    await expect(handler({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "agreement_required", inviteRequired: false },
    });
    await expect(handler({ action: "agreement.accept", payload: AGREEMENTS })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active" },
    });
    await expect(handler({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { user: { accountStatus: "enabled" } },
    });
    expect(JSON.stringify(state.documents("users"))).not.toContain("anonymous-web-identity-uid");
  });

  it("activates a registered email identity after agreement without an invitation", async () => {
    const state = createDatabase();
    const handler = emailHandlerFor(state.database, "email-identity-uid");

    await expect(handler({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "agreement_required", inviteRequired: false },
    });
    await expect(handler({ action: "agreement.accept", payload: AGREEMENTS })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "active" },
    });
    await expect(handler({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { user: { activationStatus: "active" } },
    });
    expect(JSON.stringify(state.documents("users"))).not.toContain("email-identity-uid");
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

  it("lets an administrator adjust today's quota and enable or disable ordinary users", async () => {
    const state = createDatabase();
    const admin = handlerFor(state.database, "wx_web_admin");
    const target = handlerFor(state.database, "wx_web_target");
    const late = handlerFor(state.database, "wx_web_late_confirmation");

    await admin({ action: "agreement.accept", payload: AGREEMENTS });
    await admin({
      action: "admin.bootstrap",
      payload: { token: "bootstrap-token-is-only-used-in-tests" },
      requestId: ADMIN_REQUEST_ID,
    });
    await target({ action: "agreement.accept", payload: AGREEMENTS });
    await late({ action: "agreement.accept", payload: AGREEMENTS });

    const targetHash = hashTrustedIdentity("wx_web_target", "applymate-openid-v1");
    const lateHash = hashTrustedIdentity("wx_web_late_confirmation", "applymate-openid-v1");
    const targetUser = state.documents("users").find((item) => item.identityHash === targetHash);
    const lateUser = state.documents("users").find((item) => item.identityHash === lateHash);
    expect(targetUser).toBeDefined();
    expect(lateUser).toBeDefined();
    Object.assign(targetUser ?? {}, {
      activationStatus: "active",
      activatedAt: "2026-08-05T12:00:00.000Z",
      firstResumeConfirmedAt: "2026-08-06T12:00:00.000Z",
    });
    Object.assign(lateUser ?? {}, {
      activationStatus: "active",
      activatedAt: "2026-07-01T12:00:00.000Z",
      firstResumeConfirmedAt: "2026-07-10T12:00:00.000Z",
    });

    await expect(admin({
      action: "admin.quotaAdjust",
      payload: {
        targetUserId: targetUser?.userId,
        increase: 5,
        reason: "synthetic Web test allowance",
      },
      requestId: "71234567-1234-4123-8123-123456789abc",
    })).resolves.toMatchObject({ ok: true, data: { temporaryIncrease: 5, limit: 25 } });
    await expect(target({ action: "user.get", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { user: { remainingQuota: 25 } },
    });

    await expect(admin({ action: "admin.stats", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: {
        metrics: { firstResumeConfirmation: { numerator: 1, denominator: 2 } },
        ratios: { firstResumeConfirmation: 0.5 },
      },
    });

    await expect(admin({
      action: "admin.userSetEnabled",
      payload: {
        targetUserId: targetUser?.userId,
        enabled: false,
        reason: "synthetic Web access test",
      },
      requestId: "81234567-1234-4123-8123-123456789abc",
    })).resolves.toMatchObject({ ok: true, data: { accountStatus: "disabled" } });
    await expect(target({ action: "auth.status", payload: {} })).resolves.toMatchObject({
      ok: true,
      data: { accessState: "disabled" },
    });
    await expect(admin({
      action: "admin.userSetEnabled",
      payload: {
        targetUserId: targetUser?.userId,
        enabled: true,
        reason: "synthetic Web access test",
      },
      requestId: "91234567-1234-4123-8123-123456789abc",
    })).resolves.toMatchObject({ ok: true, data: { accountStatus: "enabled" } });
    expect(state.documents("audit_logs").filter((item) =>
      ["admin.quotaAdjust", "admin.userSetEnabled"].includes(String(item.action)),
    )).toHaveLength(3);
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

    state.documents("applications").push({
      _id: "application_preview_001",
      recordType: "application",
      applicationId: "application_preview_001",
      userId: owner?.userId,
      greetingBody: "您好，这是只返回给当前用户的首屏正文。",
      jdSnapshot: {
        jobTitle: { text: "产品实习生" },
        companyName: { text: "示例公司" },
      },
      generationDisclosure: { mode: "real", modelName: "腾讯混元" },
    });
    state.documents("ai_jobs").push({
      _id: "job_synthetic_live_preview_001",
      recordType: "ai_job",
      claimState: "claimed",
      jobId: "job_synthetic_live_preview_001",
      userId: owner?.userId,
      kind: "greeting_generate",
      status: "succeeded",
      statusHistory: [{ status: "succeeded", enteredAt: timestamp }],
      result: { applicationId: "application_preview_001" },
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await expect(user({
      action: "job.get",
      payload: { jobId: "job_synthetic_live_preview_001" },
    })).resolves.toMatchObject({
      ok: true,
      data: {
        resultPreview: {
          applicationId: "application_preview_001",
          companyName: "示例公司",
          greetingBody: "您好，这是只返回给当前用户的首屏正文。",
          jobTitle: "产品实习生",
          generationDisclosure: { availability: "available" },
        },
      },
    });
    await expect(other({
      action: "job.get",
      payload: { jobId: "job_synthetic_live_preview_001" },
    })).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
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
