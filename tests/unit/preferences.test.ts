import { describe, expect, it } from "vitest";

import { createPreferenceFacts } from "../../shared/src/index.js";

describe("preference facts", () => {
  it("splits confirmed sentences, semicolons, and newlines", () => {
    const facts = createPreferenceFacts(
      "希望远程。 可立即到岗；每周  4 天\n可实习六个月!\n\n希望远程。",
    );

    expect(facts.map(({ text }) => text)).toEqual([
      "希望远程",
      "可立即到岗",
      "每周 4 天",
      "可实习六个月",
    ]);
    expect(facts.every(({ sourceType }) => sourceType === "preference")).toBe(true);
    expect(new Set(facts.map(({ factId }) => factId)).size).toBe(facts.length);
  });

  it("accepts exactly 500 visible characters", () => {
    const [fact] = createPreferenceFacts(` ${"字".repeat(500)} `);

    expect(fact?.text).toHaveLength(500);
  });

  it("rejects more than 500 visible characters", () => {
    expect(() => createPreferenceFacts("字".repeat(501))).toThrowError(
      "Preference text exceeds 500 visible characters.",
    );
  });

  it("returns an empty list for empty input", () => {
    expect(createPreferenceFacts(" \n；。 ")).toEqual([]);
  });
});
