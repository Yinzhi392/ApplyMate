import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  calculateResourceCostSummary,
  type ResourceUsageLog,
} from "../../cloudfunctions/api/src/index.js";

interface AuditResource {
  resource: ResourceUsageLog["resource"];
  calls: number;
  units: number;
  unitName: string;
  estimatedCostYuan: number;
  actualCostYuan: number;
}

interface Phase0CostAudit {
  auditVersion: string;
  scope: string;
  resources: AuditResource[];
  estimatedCostYuan: number;
  actualCostYuan: number;
  actualCostIsZero: boolean;
  storesCredentials: boolean;
  storesUserContent: boolean;
}

function loadAudit(): Phase0CostAudit {
  return JSON.parse(
    readFileSync(
      resolve("docs/phase-10/phase0-resource-cost-audit.json"),
      "utf8",
    ),
  ) as Phase0CostAudit;
}

describe("phase 0.14 resource-cost audit", () => {
  it("covers exactly the five required resources and records zero actual cost", () => {
    const audit = loadAudit();
    const expectedResources = [
      "ocr",
      "model",
      "cloud_function",
      "storage",
      "traffic",
    ];

    expect(audit.auditVersion).toBe("phase0-cost-v1");
    expect(audit.scope).toBe("phase0-formal-30-cases");
    expect(audit.resources.map(({ resource }) => resource)).toEqual(
      expectedResources,
    );
    expect(new Set(audit.resources.map(({ resource }) => resource)).size).toBe(
      5,
    );
    expect(audit.resources.every(({ actualCostYuan }) => actualCostYuan === 0))
      .toBe(true);
    expect(audit.actualCostYuan).toBe(0);
    expect(audit.actualCostIsZero).toBe(true);
    expect(audit.storesCredentials).toBe(false);
    expect(audit.storesUserContent).toBe(false);
  });

  it("recomputes the saved totals with the production cost calculator", () => {
    const audit = loadAudit();
    const logs: ResourceUsageLog[] = audit.resources.map((resource) => ({
      logId: `phase0_${resource.resource}`,
      userId: "user_synthetic",
      resource: resource.resource,
      operation: "phase0.formal-evaluation",
      units: resource.units,
      unitName: resource.unitName,
      estimatedCostYuan: resource.estimatedCostYuan,
      actualCostYuan: resource.actualCostYuan,
      durationMs: 0,
      status: "succeeded",
      createdAt: "2026-08-11T07:45:02.000Z",
    }));
    const summary = calculateResourceCostSummary(logs);

    expect(summary.estimatedCostYuan).toBeCloseTo(
      audit.estimatedCostYuan,
      10,
    );
    expect(summary.actualCostYuan).toBe(audit.actualCostYuan);
    expect(summary.actualCostIsZero).toBe(audit.actualCostIsZero);
  });
});
