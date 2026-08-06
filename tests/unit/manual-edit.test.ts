import { describe, expect, it } from "vitest";

import {
  evaluateManualGreeting,
  validateAiGreeting,
} from "../../shared/src/index.js";

const draft = {
  body: "您好，我掌握SQL。\n我可以在2026年到岗。",
  claims: [
    {
      claimId: "claim_skill",
      text: "我掌握SQL",
      sources: [
        { type: "fact" as const, factId: "fact_1234567890abcdef12345678" },
      ],
    },
  ],
  omittedRequirements: [],
  warnings: [],
};

const registry = {
  factIds: new Set(["fact_1234567890abcdef12345678"]),
  jdFieldIds: new Set<string>(),
};

describe("manual greeting warnings", () => {
  it("allows saving and copying while warning about length and unsupported facts", () => {
    const result = evaluateManualGreeting(draft, registry);

    expect(result.canSave).toBe(true);
    expect(result.canCopy).toBe(true);
    expect(result.warnings).toContain("BODY_LENGTH_INVALID");
    expect(result.warnings).toContain("UNSOURCED_NUMBER");
  });

  it("hard-fails the same content when it is AI output", () => {
    const result = validateAiGreeting(draft, registry);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("BODY_LENGTH_INVALID");
    expect(result.errors).toContain("UNSOURCED_NUMBER");
  });

  it("still reports real measurements when a manual body exceeds the AI schema size", () => {
    const oversized = { ...draft, body: "字".repeat(5_001) };

    const result = evaluateManualGreeting(oversized, registry);

    expect(result.canSave).toBe(true);
    expect(result.visibleCharacterCount).toBe(5_001);
    expect(result.paragraphCount).toBe(1);
    expect(result.warnings).toContain("INVALID_GREETING_SCHEMA");
  });
});
