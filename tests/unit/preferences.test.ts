import { describe, expect, it } from "vitest";

import {
  createPreferenceFacts,
  isEducationHighlightPreferenceText,
} from "../../shared/src/index.js";

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

  it("recognizes only an explicit request to highlight education", () => {
    expect(isEducationHighlightPreferenceText("教育背景是我的求职优势，请简短突出")).toBe(true);
    expect(isEducationHighlightPreferenceText("请重点写我的专业和成绩")).toBe(true);
    expect(isEducationHighlightPreferenceText("每周可到岗四天，可连续实习四个月")).toBe(false);
    expect(isEducationHighlightPreferenceText("就读于示例大学，GPA 3.6")).toBe(false);
  });
});
