import { describe, expect, it } from "vitest";

import {
  InMemoryOperationsRepository,
  ResourceUsageLogSchema,
} from "../../cloudfunctions/api/src/index.js";

const CREATED_AT = "2026-08-06T06:00:00.000Z";

describe("resource usage logging", () => {
  it("accepts only metadata and summarizes every cost category", async () => {
    const unsafe = {
      logId: "resource_unsafe",
      userId: "user_synthetic",
      resource: "model",
      operation: "greeting.generate",
      units: 1,
      unitName: "tokens",
      estimatedCostYuan: 0,
      actualCostYuan: 0,
      durationMs: 1,
      status: "succeeded",
      createdAt: CREATED_AT,
      rawPrompt: "不得保存的合成原文",
    };
    expect(ResourceUsageLogSchema.safeParse(unsafe).success).toBe(false);

    const repository = new InMemoryOperationsRepository();
    for (const [index, resource] of [
      "ocr",
      "model",
      "cloud_function",
      "storage",
      "traffic",
    ].entries()) {
      await repository.recordResourceUsage({
        logId: `resource_safe_${index}`,
        userId: "user_synthetic",
        resource: resource as
          | "ocr"
          | "model"
          | "cloud_function"
          | "storage"
          | "traffic",
        operation: `synthetic.${resource}`,
        units: index + 1,
        unitName: resource === "traffic" ? "bytes" : "calls",
        estimatedCostYuan: index / 100,
        actualCostYuan: 0,
        durationMs: index * 10,
        status: index === 1 ? "failed" : "succeeded",
        contentHash: "b".repeat(64),
        createdAt: CREATED_AT,
      });
    }

    await expect(repository.getResourceStats("2026-08-06")).resolves.toEqual([
      {
        resource: "ocr",
        calls: 1,
        units: 1,
        estimatedCostYuan: 0,
        actualCostYuan: 0,
        failures: 0,
      },
      {
        resource: "model",
        calls: 1,
        units: 2,
        estimatedCostYuan: 0.01,
        actualCostYuan: 0,
        failures: 1,
      },
      {
        resource: "cloud_function",
        calls: 1,
        units: 3,
        estimatedCostYuan: 0.02,
        actualCostYuan: 0,
        failures: 0,
      },
      {
        resource: "storage",
        calls: 1,
        units: 4,
        estimatedCostYuan: 0.03,
        actualCostYuan: 0,
        failures: 0,
      },
      {
        resource: "traffic",
        calls: 1,
        units: 5,
        estimatedCostYuan: 0.04,
        actualCostYuan: 0,
        failures: 0,
      },
    ]);

    const serialized = JSON.stringify(await repository.listResourceUsage());
    expect(serialized).not.toContain("rawPrompt");
    expect(serialized).not.toContain("不得保存的合成原文");
  });
});
