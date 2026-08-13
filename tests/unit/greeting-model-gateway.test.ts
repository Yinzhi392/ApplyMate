import { describe, expect, it } from "vitest";

import {
  GreetingModelGateway,
  TextModelProviderError,
} from "../../cloudfunctions/worker/src/index.js";

const DRAFT = {
  body: "合成正文",
  claims: [
    {
      claimId: "claim_1",
      text: "合成正文",
      sources: [{ type: "jd" as const, fieldId: "jd_job_title" }],
    },
  ],
  omittedRequirements: [],
  warnings: [],
};

describe("greeting model gateway", () => {
  it.each([
    ["429", new TextModelProviderError("rate_limited")],
    ["provider failure", new TextModelProviderError("failed")],
  ])("switches to the fallback after %s without retrying the primary", async (_label, failure) => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const gateway = new GreetingModelGateway(
      {
        modelId: "primary",
        generate: async () => {
          primaryCalls += 1;
          throw failure;
        },
      },
      {
        modelId: "fallback",
        generate: async () => {
          fallbackCalls += 1;
          return DRAFT;
        },
      },
    );

    await expect(gateway.generate("masked synthetic input")).resolves.toEqual(DRAFT);
    expect({ primaryCalls, fallbackCalls }).toEqual({ primaryCalls: 1, fallbackCalls: 1 });
  });

  it("switches after invalid JSON and never writes prompt or PII into logs", async () => {
    const logs: unknown[] = [];
    const sensitiveInput = "候选人电话 [PHONE]，原值不可出现";
    const gateway = new GreetingModelGateway(
      { modelId: "primary", generate: async () => "{bad-json" },
      { modelId: "fallback", generate: async () => JSON.stringify(DRAFT) },
      { record: (entry) => { logs.push(entry); } },
    );

    await expect(gateway.generate(sensitiveInput)).resolves.toEqual(DRAFT);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(sensitiveInput);
    expect(serialized).not.toContain("候选人电话");
    expect(serialized).toContain("inputHash");
  });

  it("returns the successful fallback model metadata for persistence", async () => {
    const gateway = new GreetingModelGateway(
      { modelId: "primary", generate: async () => "{bad-json" },
      {
        modelId: "fallback",
        disclosure: {
          mode: "real",
          providerName: "已核实提供方",
          modelName: "已核实模型",
          filingReference: "已核实备案信息",
        },
        generate: async () => DRAFT,
      },
    );

    await expect(gateway.generateWithMetadata("masked input")).resolves.toEqual({
      draft: DRAFT,
      model: {
        mode: "real",
        providerName: "已核实提供方",
        modelName: "已核实模型",
        modelId: "fallback",
        filingReference: "已核实备案信息",
      },
    });
  });

  it("bounds timeout behavior below 45 seconds", async () => {
    const gateway = new GreetingModelGateway(
      {
        modelId: "primary",
        generate: async () => new Promise<never>(() => undefined),
      },
      undefined,
      undefined,
      5,
    );
    const started = Date.now();

    await expect(gateway.generate("masked input")).rejects.toMatchObject({
      code: "MODEL_FAILED",
      retryable: true,
    });
    expect(Date.now() - started).toBeLessThan(200);
    expect(
      () => new GreetingModelGateway(
        { modelId: "primary", generate: async () => DRAFT },
        undefined,
        undefined,
        45_000,
      ),
    ).toThrow(/below 45 seconds/u);
  });

  it("stops immediately when the enclosing worker aborts", async () => {
    const gateway = new GreetingModelGateway(
      {
        modelId: "primary",
        generate: async () => new Promise<never>(() => undefined),
      },
      undefined,
      undefined,
      1_000,
    );
    const controller = new AbortController();
    controller.abort();
    const started = Date.now();

    await expect(
      gateway.generate("masked input", controller.signal),
    ).rejects.toMatchObject({ code: "MODEL_FAILED", retryable: true });
    expect(Date.now() - started).toBeLessThan(200);
  });
});
