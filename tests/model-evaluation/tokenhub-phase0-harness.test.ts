import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

interface LockedCase {
  caseId: string;
  maskedCount: number;
}

interface HarnessModule {
  TOKENHUB_BASE_URL: string;
  TOKENHUB_MODELS: string[];
  loadLockedCases(filePath: string): LockedCase[];
  buildPlan(cases: LockedCase[]): unknown[];
  buildPrompt(task: string, fixture: LockedCase): string;
  buildSources(fixture: LockedCase): {
    facts: Array<{ factId: string; text: string }>;
  };
  renderDeterministicGreeting(
    fixture: LockedCase,
    selectedFactIds: string[],
    omittedRequirements: string[],
    variant: "generate" | "rewrite",
  ): unknown;
  evaluateGreeting(
    value: unknown,
    fixture: LockedCase,
  ): { compliant: boolean; hallucinationCount: number };
  maskProtectedText(value: string): { matchCount: number };
  safeCheckpointEntry(input: {
    caseId: string;
    modelId: string;
    task: string;
    durationMs: number;
    usage: Record<string, unknown>;
    input: string;
    output: string;
    status?: "completed" | "timeout" | "failed" | "skipped";
    verdict: {
      schemaValid: boolean;
      compliant: boolean;
      hallucinationCount: number;
    };
  }): Record<string, unknown>;
  assertSafeCheckpoint(value: unknown): void;
}

let harness: HarnessModule;
let cases: LockedCase[];

beforeAll(async () => {
  harness = (await import("../../scripts/phase0-tokenhub-lib.mjs")) as HarnessModule;
  cases = harness.loadLockedCases(
    join(process.cwd(), "tests", "fixtures", "phase-0-cases.md"),
  );
});

describe("phase 0.12 TokenHub evaluation harness", () => {
  it("locks the official endpoint, two models, 30 cases and three tasks", () => {
    expect(harness.TOKENHUB_BASE_URL).toBe("https://tokenhub.tencentmaas.com/v1");
    expect(harness.TOKENHUB_MODELS).toEqual(["deepseek-v4-flash", "hy3"]);
    expect(cases).toHaveLength(30);
    expect(harness.buildPlan(cases)).toHaveLength(180);
  });

  it("masks all synthetic PII in C27 before prompt construction", () => {
    const fixture = cases.find(({ caseId }) => caseId === "C27");
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      throw new Error("C27 is missing.");
    }
    expect(fixture?.maskedCount).toBeGreaterThanOrEqual(4);
    const prompt = harness.buildPrompt("structure", fixture);
    expect(prompt).not.toContain("13800000001");
    expect(prompt).not.toContain("fixture27@example.invalid");
    expect(prompt).not.toContain("11010119900101000X");
    expect(prompt).not.toContain("样例路 27 号");
    expect(harness.maskProtectedText(prompt).matchCount).toBe(0);
  });

  it("stores only hashes, metrics and deterministic verdicts", () => {
    const entry = harness.safeCheckpointEntry({
      caseId: "C01",
      modelId: "hy3",
      task: "generate",
      durationMs: 100,
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      input: "synthetic prompt",
      output: "synthetic output",
      verdict: { schemaValid: true, compliant: true, hallucinationCount: 0 },
    });
    expect(entry).not.toHaveProperty("input");
    expect(entry).not.toHaveProperty("output");
    expect(entry.inputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(entry.outputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(entry.status).toBe("completed");
    expect(() => harness.assertSafeCheckpoint({ entries: [entry] })).not.toThrow();
    expect(() => harness.assertSafeCheckpoint({ prompt: "must fail" })).toThrow();
  });

  it("renders compliant zero-hallucination generate and rewrite drafts for all cases", () => {
    for (const fixture of cases) {
      const factIds = harness.buildSources(fixture).facts.map(({ factId }) => factId);
      expect(factIds.length, fixture.caseId).toBeGreaterThanOrEqual(2);
      const selections = [
        factIds.slice(0, 2),
        factIds.slice(0, 3),
        factIds.slice(-2),
        factIds.slice(-3),
      ];
      for (const selectedFactIds of selections) {
        for (const variant of ["generate", "rewrite"] as const) {
          const draft = harness.renderDeterministicGreeting(
            fixture,
            selectedFactIds,
            [],
            variant,
          );
          const verdict = harness.evaluateGreeting(draft, fixture);
          expect(
            verdict.compliant,
            `${fixture.caseId}:${selectedFactIds.length}:${variant}`,
          ).toBe(true);
          expect(
            verdict.hallucinationCount,
            `${fixture.caseId}:${selectedFactIds.length}:${variant}`,
          ).toBe(0);
        }
      }
    }
  });
});
