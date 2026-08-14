import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createScfAsyncInvoker } = require("../../cloudfunctions/api/deploy/scf-async-invoker.js") as {
  createScfAsyncInvoker(options: {
    secretId: string;
    secretKey: string;
    sessionToken: string;
    region: string;
    namespace: string;
    fetchImpl: typeof fetch;
    now: () => Date;
  }): (jobId: string) => Promise<{ ok: true; data: { accepted: true } }>;
};

describe("SCF asynchronous worker invocation", () => {
  it("submits a signed Event invocation and returns after SCF accepts it", async () => {
    const requests: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: init?.headers as Record<string, string>,
      });
      return new Response(JSON.stringify({ Response: { Result: { InvokeResult: 0 }, RequestId: "synthetic-request" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const invoke = createScfAsyncInvoker({
      secretId: "synthetic-secret-id",
      secretKey: "synthetic-secret-key",
      sessionToken: "synthetic-session-token",
      region: "ap-shanghai",
      namespace: "synthetic-namespace",
      fetchImpl,
      now: () => new Date("2026-08-14T00:00:00.000Z"),
    });

    await expect(invoke("job_resume_0123456789abcdef01234567")).resolves.toEqual({
      ok: true,
      data: { accepted: true },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toMatchObject({
      FunctionName: "worker",
      InvocationType: "Event",
      Namespace: "synthetic-namespace",
      ClientContext: JSON.stringify({ jobId: "job_resume_0123456789abcdef01234567" }),
    });
    expect(requests[0]?.headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=synthetic-secret-id\//u);
    expect(requests[0]?.headers["X-TC-Action"]).toBe("Invoke");
    expect(requests[0]?.headers["X-TC-Token"]).toBe("synthetic-session-token");
  });
});
