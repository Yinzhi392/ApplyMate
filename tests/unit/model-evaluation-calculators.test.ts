import { describe, expect, it } from "vitest";

import {
  calculateFieldAccuracy,
  type EvaluationCaseVerdict,
} from "../../shared/src/index.js";
import {
  calculateResourceCostSummary,
  type ResourceUsageLog,
} from "../../cloudfunctions/api/src/index.js";

function confirmedCases(count = 30): EvaluationCaseVerdict[] {
  return Array.from({ length: count }, (_, caseIndex) => ({
    caseId: `C${String(caseIndex + 1).padStart(2, "0")}`,
    humanConfirmed: true,
    fields: Array.from({ length: 6 }, (_, fieldIndex) => ({
      fieldId: `field_${fieldIndex + 1}`,
      correct: !(caseIndex === 29 && fieldIndex === 5),
    })),
  }));
}

describe("model evaluation calculators", () => {
  it("calculates field-level accuracy only after all 30 cases are human-confirmed", () => {
    expect(calculateFieldAccuracy(confirmedCases())).toEqual({
      confirmedCases: 30,
      correctFields: 179,
      totalFields: 180,
      accuracy: 179 / 180,
      formal: true,
    });
    expect(() => calculateFieldAccuracy(confirmedCases(29))).toThrow(
      /30 human-confirmed cases/u,
    );
    const unconfirmed = confirmedCases();
    unconfirmed[8] = { ...unconfirmed[8]!, humanConfirmed: false };
    expect(() => calculateFieldAccuracy(unconfirmed)).toThrow(
      /30 human-confirmed cases/u,
    );
  });

  it("aggregates all five resource categories and proves whether actual cost is zero", () => {
    const resources = ["ocr", "model", "cloud_function", "storage", "traffic"] as const;
    const logs: ResourceUsageLog[] = resources.map((resource, index) => ({
      logId: `log_${resource}`,
      userId: "user_synthetic",
      resource,
      operation: `synthetic.${resource}`,
      units: index + 1,
      unitName: "units",
      estimatedCostYuan: 0.01 * index,
      actualCostYuan: resource === "traffic" ? 0.02 : 0,
      durationMs: 10,
      status: "succeeded",
      createdAt: "2026-08-09T02:00:00.000Z",
    }));

    const summary = calculateResourceCostSummary(logs);
    expect(summary.resources).toHaveLength(5);
    expect(summary.resources.map(({ resource }) => resource)).toEqual(resources);
    expect(summary.actualCostYuan).toBeCloseTo(0.02);
    expect(summary.actualCostIsZero).toBe(false);
    expect(
      calculateResourceCostSummary(
        logs.map((log) => ({ ...log, actualCostYuan: 0 })),
      ).actualCostIsZero,
    ).toBe(true);
  });
});
