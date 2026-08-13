import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type GateStatus = "passed" | "failed";

interface DecisionGate {
  gateId: string;
  status: GateStatus;
  actual: boolean | number | string;
  threshold: boolean | number | string;
}

interface Phase0DecisionReport {
  reportVersion: string;
  sampleVersion: string;
  decision: "continue" | "stop";
  stage0CanContinue: boolean;
  requiredGates: DecisionGate[];
  blockingGateIds: string[];
  nextStageAuthorized: boolean;
  authorizationScope?: string;
  storesUserContent: boolean;
  storesCredentials: boolean;
}

function loadReport(): Phase0DecisionReport {
  return JSON.parse(
    readFileSync(
      resolve("docs/phase-10/phase0-decision-report.json"),
      "utf8",
    ),
  ) as Phase0DecisionReport;
}

describe("phase 0.15 continue or stop report", () => {
  it("allows technical continuation only when every gate passes", () => {
    const report = loadReport();
    const expectedGateIds = [
      "human_confirmed_cases",
      "ocr_field_accuracy",
      "model_field_accuracy",
      "greeting_compliance",
      "hallucination_count",
      "token_pipeline_median_ms",
      "ocr_median_ms",
      "ocr_worker_max_ms",
      "privacy_egress",
      "actual_cost_zero",
    ];
    const recomputedCanContinue = report.requiredGates.every(
      ({ status }) => status === "passed",
    );

    expect(report.reportVersion).toBe("phase0-decision-v2");
    expect(report.sampleVersion).toBe("phase0-v1.0");
    expect(report.requiredGates.map(({ gateId }) => gateId)).toEqual(
      expectedGateIds,
    );
    expect(new Set(expectedGateIds).size).toBe(10);
    expect(recomputedCanContinue).toBe(true);
    expect(report.stage0CanContinue).toBe(recomputedCanContinue);
    expect(report.decision).toBe("continue");
    expect(report.nextStageAuthorized).toBe(true);
    expect(report.authorizationScope).toBe(
      "phase0.17_approval_record_only",
    );
  });

  it("locks the remediated OCR gates without storing sensitive content", () => {
    const report = loadReport();
    const gates = new Map(
      report.requiredGates.map((gate) => [gate.gateId, gate]),
    );

    expect(report.blockingGateIds).toEqual([]);
    expect(gates.get("ocr_median_ms")).toEqual({
      gateId: "ocr_median_ms",
      status: "passed",
      actual: 1429,
      threshold: 10000,
    });
    expect(gates.get("ocr_worker_max_ms")).toEqual({
      gateId: "ocr_worker_max_ms",
      status: "passed",
      actual: 1940,
      threshold: 45000,
    });
    expect(report.storesUserContent).toBe(false);
    expect(report.storesCredentials).toBe(false);
  });
});
