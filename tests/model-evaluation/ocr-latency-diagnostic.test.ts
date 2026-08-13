import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

interface OcrImageVariant {
  id: "original-png" | "jpeg-960-q85" | "jpeg-720-q80";
  width: number;
  height: number;
  format: "PNG" | "JPEG";
}

interface LatencyModule {
  DIAGNOSTIC_REPETITIONS: number;
  MAX_OCR_CALLS: number;
  OCR_IMAGE_VARIANTS: OcrImageVariant[];
  REPRESENTATIVE_CASE_IDS: string[];
  buildTc3Headers: (input: { secretId: string; secretKey: string; body: string; timestamp: number }) => Record<string, string>;
  calculateCharacterRecall: (source: string, observed: string) => number;
  createDiagnosticPlan: () => { diagnosticCalls: unknown[]; fullRetestCalls: number; maximumCalls: number };
  createSafeObservation: (input: { caseId: string; variant: OcrImageVariant; runIndex: number; image: Buffer; timing: { totalDurationMs: number; phases: Record<string, number> }; evidence: { recall: number; correctFieldCount: number }; errorCode: string | null }) => Record<string, unknown>;
  isSafeDiagnosticTempDirectory: (directory: string) => boolean;
  selectWinningVariant: (observations: Array<{ variantId: OcrImageVariant["id"]; totalDurationMs: number; correctFieldCount: number; errorCode: string | null }>) => { candidates: Array<{ variantId: OcrImageVariant["id"]; passed: boolean }>; winner: { variantId: OcrImageVariant["id"] } | null };
}

let latency: LatencyModule;

beforeAll(async () => {
  latency = (await import("../../scripts/phase0-ocr-latency-lib.mjs")) as unknown as LatencyModule;
});

describe("phase 0.11R OCR latency diagnostic", () => {
  it("fixes the diagnostic budget and representative sample matrix", () => {
    const plan = latency.createDiagnosticPlan();

    expect(latency.REPRESENTATIVE_CASE_IDS).toEqual([
      "C01",
      "C04",
      "C10",
      "C14",
      "C18",
      "C29",
    ]);
    expect(latency.OCR_IMAGE_VARIANTS.map(({ id }) => id)).toEqual([
      "original-png",
      "jpeg-960-q85",
      "jpeg-720-q80",
    ]);
    expect(latency.DIAGNOSTIC_REPETITIONS).toBe(4);
    expect(plan.diagnosticCalls).toHaveLength(72);
    expect(plan.fullRetestCalls).toBe(30);
    expect(plan.maximumCalls).toBe(latency.MAX_OCR_CALLS);
  });

  it("creates a deterministic TC3 authorization header without exposing the secret", () => {
    const secretKey = "synthetic-test-secret";
    const headers = latency.buildTc3Headers({
      secretId: "synthetic-id",
      secretKey,
      body: '{"ImageBase64":"synthetic-image"}',
      timestamp: 1_786_300_800,
    });

    expect(headers.Authorization).toMatch(/^TC3-HMAC-SHA256 Credential=synthetic-id\//u);
    expect(headers.Authorization).not.toContain(secretKey);
    expect(headers["X-TC-Action"]).toBe("GeneralBasicOCR");
    expect(headers["X-TC-Version"]).toBe("2018-11-19");
  });

  it("selects only a passing fastest candidate and rejects an OCR timeout", () => {
    const observations = latency.OCR_IMAGE_VARIANTS.flatMap((variant) =>
      Array.from({ length: 24 }, (_, index) => ({
        variantId: variant.id,
        totalDurationMs:
          variant.id === "original-png"
            ? 9_800
            : variant.id === "jpeg-960-q85"
              ? 8_900
              : 8_900,
        correctFieldCount: 6,
        errorCode:
          variant.id === "original-png" && index === 0 ? "OCR_TIMEOUT" : null,
      })),
    );
    const result = latency.selectWinningVariant(observations);

    expect(result.candidates.find(({ variantId }) => variantId === "original-png")?.passed).toBe(false);
    expect(result.winner?.variantId).toBe("jpeg-960-q85");
  });

  it("stores only safe OCR evidence and protects the temporary directory boundary", () => {
    const originalVariant = latency.OCR_IMAGE_VARIANTS[0];
    if (!originalVariant) throw new Error("The original image variant is required for this test.");
    const observation = latency.createSafeObservation({
      caseId: "C01",
      variant: originalVariant,
      runIndex: 1,
      image: Buffer.from("synthetic-image"),
      timing: {
        totalDurationMs: 9_000,
        phases: { localPreparationMs: 4 },
      },
      evidence: { recall: 0.95, correctFieldCount: 6 },
      errorCode: null,
    });

    expect(latency.calculateCharacterRecall("产品运营", "产品运营")).toBe(1);
    expect(observation).not.toHaveProperty("texts");
    expect(JSON.stringify(observation)).not.toContain("synthetic-image");
    expect(latency.isSafeDiagnosticTempDirectory("/private/tmp/applymate-phase0-ocr-latency")).toBe(true);
    expect(latency.isSafeDiagnosticTempDirectory("/Users/mayinzhi/Desktop/投了吗")).toBe(false);
  });

  it("records the selected full-retest variant without OCR content", () => {
    const report = JSON.parse(
      readFileSync(
        resolve("docs/phase-10/ocr-latency-remediation-evaluation.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(report.selectedVariantId).toBe("jpeg-720-q80");
    expect(JSON.stringify(report)).not.toContain("TextDetections");
    expect(JSON.stringify(report)).not.toContain("RequestId");
  });
});
