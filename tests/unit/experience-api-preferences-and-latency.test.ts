import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createExperienceApiHandler } = require("../../cloudfunctions/api/deploy/experience-api.js") as {
  createExperienceApiHandler(input: Record<string, unknown>):
    (input: { event: Record<string, unknown>; user: Record<string, unknown> }) => Promise<Record<string, unknown>>;
};

type Document = Record<string, unknown>;

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
                return { deleted: 0 };
              },
            };
          },
        };
      },
    },
  };
}

const user = { userId: "user_test", accountStatus: "enabled" };

describe("experience API preference and low-latency contracts", () => {
  it("rejects a Web file path that is not owned by the trusted anonymous user", async () => {
    const state = createDatabase();
    const webUser = {
      ...user,
      identityNamespace: "web-anonymous-uid-v1",
      userId: "user_aaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const handler = createExperienceApiHandler({
      database: state.database,
      dispatchExperienceJob: async () => ({ ok: true }),
      accessState: () => "active",
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    });

    await expect(handler({
      event: {
        action: "resume.parse",
        payload: {
          inputType: "images",
          fileIds: ["cloud://env.bucket/temporary/web/user_bbbbbbbbbbbbbbbbbbbbbbbb/resume.jpg"],
          fileAccessUrls: ["https://bucket.tcb.qcloud.la/temporary/web/user_bbbbbbbbbbbbbbbbbbbbbbbb/resume.jpg?sign=creator"],
        },
        requestId: "f1234567-1234-4123-8123-123456789abc",
      },
      user: webUser,
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    await expect(handler({
      event: {
        action: "resume.parse",
        payload: {
          inputType: "images",
          fileIds: ["cloud://env.bucket/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/resume.jpg"],
          fileAccessUrls: ["https://bucket.tcb.qcloud.la/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/resume.jpg?sign=creator"],
        },
        requestId: "f2234567-1234-4123-8123-123456789abc",
      },
      user: webUser,
    })).resolves.toMatchObject({ ok: true, data: { resumeId: expect.any(String) } });
  });

  it("accepts only creator-issued CloudBase access URLs that match the owned Web file", async () => {
    const state = createDatabase();
    const webUser = {
      ...user,
      identityNamespace: "web-email-uid-v1",
      userId: "user_aaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const handler = createExperienceApiHandler({
      database: state.database,
      dispatchExperienceJob: async () => ({ ok: true }),
      accessState: () => "active",
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    });
    const fileId = "cloud://env.bucket/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/resume.pdf";
    const validUrl = "https://bucket.tcb.qcloud.la/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/resume.pdf?sign=creator";

    await expect(handler({
      event: {
        action: "resume.parse",
        payload: { inputType: "pdf", fileIds: [fileId], fileAccessUrls: ["https://example.com/resume.pdf"] },
        requestId: "f3234567-1234-4123-8123-123456789abc",
      },
      user: webUser,
    })).resolves.toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    await expect(handler({
      event: {
        action: "resume.parse",
        payload: { inputType: "pdf", fileIds: [fileId], fileAccessUrls: [validUrl] },
        requestId: "f4234567-1234-4123-8123-123456789abc",
      },
      user: webUser,
    })).resolves.toMatchObject({ ok: true, data: { resumeId: expect.any(String) } });
    expect(state.documents("ai_jobs")[0]?.input).toMatchObject({ fileAccessUrls: [validUrl] });
  });

  it("accepts preferenceText, saves normalized facts, and returns them", async () => {
    const state = createDatabase();
    state.documents("users").push({ _id: "user_test", recordType: "user", ...user });
    const handler = createExperienceApiHandler({
      database: state.database,
      dispatchExperienceJob: async () => ({ ok: true }),
      accessState: () => "active",
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    const result = await handler({
      event: {
        action: "user.updatePreferences",
        payload: { preferenceText: "  希望远程。\n可立即到岗  " },
        requestId: "a1234567-1234-4123-8123-123456789abc",
      },
      user,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        preferenceText: "希望远程。\n可立即到岗",
        preferenceFacts: [
          { sourceType: "preference", text: "希望远程" },
          { sourceType: "preference", text: "可立即到岗" },
        ],
      },
    });
    expect(state.documents("users")[0]).toMatchObject({
      preferenceText: "希望远程。\n可立即到岗",
      preferenceFacts: expect.any(Array),
    });
  });

  it("returns only jobId without polling even when the dispatched job is already done", async () => {
    const state = createDatabase();
    state.documents("resumes").push({
      _id: "resume_test",
      recordType: "resume",
      userId: user.userId,
      resumeId: "resume_test",
      status: "confirmed",
    });
    const handler = createExperienceApiHandler({
      database: state.database,
      dispatchExperienceJob: async () => {
        const job = state.documents("ai_jobs")[0];
        if (job) {
          job.status = "succeeded";
          job.result = JSON.stringify({ applicationId: "application_test" });
        }
        return { ok: true };
      },
      accessState: () => "active",
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    await expect(handler({
      event: {
        action: "generation.create",
        payload: { inputType: "text", text: "产品实习生岗位", resumeId: "resume_test" },
        requestId: "b1234567-1234-4123-8123-123456789abc",
      },
      user,
    })).resolves.toMatchObject({
      ok: true,
      data: { jobId: expect.stringMatching(/^job_generation_/u) },
    });
  });

  it("stores only bounded client timing diagnostics for image generation", async () => {
    const state = createDatabase();
    state.documents("resumes").push({
      _id: "resume_test",
      recordType: "resume",
      userId: user.userId,
      resumeId: "resume_test",
      status: "confirmed",
    });
    const handler = createExperienceApiHandler({
      database: state.database,
      dispatchExperienceJob: async () => ({ ok: true }),
      accessState: () => "active",
      now: () => new Date("2026-08-21T12:00:00.000Z"),
    });

    await handler({
      event: {
        action: "generation.create",
        payload: {
          inputType: "images",
          fileIds: ["cloud://test/temporary/jd.jpg"],
          resumeId: "resume_test",
          clientPipelineVersion: "jd-submit-v6-background-upload",
          clientImagePreparationMs: 4321,
          clientBackgroundUploadMs: 3200,
          clientSelectionToCreateMs: 5100,
        },
        requestId: "c1234567-1234-4123-8123-123456789abc",
      },
      user,
    });

    expect(state.documents("ai_jobs")[0]?.processingMetrics).toEqual({
      clientImagePreparationMs: 4321,
      clientBackgroundUploadMs: 3200,
      clientSelectionToCreateMs: 5100,
      clientPipelineVersion: "jd-submit-v6-background-upload",
    });
  });

  it("records preview timing only for an owned succeeded job and its application", async () => {
    const state = createDatabase();
    const jobId = "job_generation_aaaaaaaaaaaaaaaaaaaaaaaa";
    const applicationId = "application_bbbbbbbbbbbbbbbbbbbbbbbb";
    state.documents("ai_jobs").push({
      _id: jobId,
      recordType: "ai_job",
      jobId,
      userId: user.userId,
      status: "succeeded",
      processingMetrics: { queueDurationMs: 120 },
    });
    state.documents("applications").push({
      _id: applicationId,
      recordType: "application",
      applicationId,
      jobId,
      userId: user.userId,
      processingMetrics: { modelDurationMs: 4_200 },
    });
    const handler = createExperienceApiHandler({
      database: state.database,
      dispatchExperienceJob: async () => ({ ok: true }),
      accessState: () => "active",
      now: () => new Date("2026-08-22T12:00:00.000Z"),
    });

    await expect(handler({
      event: {
        action: "performance.recordPreview",
        payload: {
          applicationId,
          jobId,
          clientApiCreateMs: 380,
          clientJobToPreviewMs: 8_900,
          clientResultFetchMs: 75,
          clientSelectionToPreviewMs: 12_100,
        },
        requestId: "d1234567-1234-4123-8123-123456789abc",
      },
      user,
    })).resolves.toEqual({ ok: true, data: { recorded: true } });

    expect(state.documents("ai_jobs")[0]?.processingMetrics).toMatchObject({
      queueDurationMs: 120,
      clientApiCreateMs: 380,
      clientResultFetchMs: 75,
    });
    expect(state.documents("applications")[0]?.processingMetrics).toMatchObject({
      modelDurationMs: 4_200,
      clientJobToPreviewMs: 8_900,
      clientSelectionToPreviewMs: 12_100,
    });

    await expect(handler({
      event: {
        action: "performance.recordPreview",
        payload: {
          applicationId,
          jobId,
          clientApiCreateMs: 380,
          clientJobToPreviewMs: 8_900,
          clientResultFetchMs: 75,
          clientSelectionToPreviewMs: 12_100,
        },
        requestId: "e1234567-1234-4123-8123-123456789abc",
      },
      user: { userId: "user_other", accountStatus: "enabled" },
    })).resolves.toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
