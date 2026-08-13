import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  calculateFieldAccuracy,
  type EvaluationCaseVerdict,
} from "../../shared/src/index.js";

interface OcrEvaluationArtifact {
  schemaVersion: string;
  sourceVersion: string;
  evaluatedAtBeijing: string;
  summary: {
    confirmedCases: number;
    correctFields: number;
    totalFields: number;
    accuracy: number;
    accuracyGatePassed: boolean;
    medianDurationMs: number;
    medianLatencyGatePassed: boolean;
    workerDeadlineGatePassed: boolean;
  };
  verdicts: EvaluationCaseVerdict[];
  caseMetrics: Array<{
    caseId: string;
    imageSha256: string;
    durationMs: number;
    sourceCharacterRecall: number;
    fieldVerdictBasis: string;
  }>;
}

const artifactPath = join(
  process.cwd(),
  "docs",
  "phase-10",
  "ocr-phase0-field-verdicts.json",
);
const artifactText = readFileSync(artifactPath, "utf8");
const artifact = JSON.parse(artifactText) as OcrEvaluationArtifact;

describe("phase-0 Tencent OCR evaluation artifact", () => {
  it("contains a formal verdict for every locked case and field", () => {
    expect(artifact.schemaVersion).toBe("ocr-phase0-evaluation-v1");
    expect(artifact.sourceVersion).toBe("phase0-v1.0");
    expect(artifact.evaluatedAtBeijing).toMatch(
      /^2026-08-11T\d{2}:\d{2}:\d{2}\+08:00$/u,
    );

    const result = calculateFieldAccuracy(artifact.verdicts);
    expect(result).toEqual({
      confirmedCases: 30,
      correctFields: 180,
      totalFields: 180,
      accuracy: 1,
      formal: true,
    });
    expect(artifact.summary).toMatchObject({
      confirmedCases: result.confirmedCases,
      correctFields: result.correctFields,
      totalFields: result.totalFields,
      accuracy: result.accuracy,
      accuracyGatePassed: true,
      medianLatencyGatePassed: false,
      workerDeadlineGatePassed: false,
    });
  });

  it("keeps only non-content evidence and records the latency failure", () => {
    expect(artifact.caseMetrics).toHaveLength(30);
    expect(artifact.caseMetrics.map(({ caseId }) => caseId)).toEqual(
      Array.from({ length: 30 }, (_, index) =>
        `C${String(index + 1).padStart(2, "0")}`,
      ),
    );
    for (const metric of artifact.caseMetrics) {
      expect(metric.imageSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(metric.durationMs).toBeGreaterThan(0);
      expect(metric.sourceCharacterRecall).toBeGreaterThanOrEqual(0.9);
    }
    expect(artifact.summary.medianDurationMs).toBeGreaterThan(10_000);
    expect(artifactText).not.toMatch(
      /(?:DetectedText|RequestId|ImageBase64|phone|email|resumeText|jdText)/u,
    );
  });
});
