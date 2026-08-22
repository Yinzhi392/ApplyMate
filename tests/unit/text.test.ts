import { describe, expect, it } from "vitest";

import {
  countVisibleCharacters,
  splitNonEmptyParagraphs,
} from "../../shared/src/index.js";

describe("visible character rules", () => {
  it("counts Chinese, English, emoji, and punctuation but excludes whitespace", () => {
    expect(countVisibleCharacters("你 好, A! 👩‍💻\n")).toBe(6);
    expect(countVisibleCharacters("e\u0301")).toBe(1);
  });

  it("counts exact greeting boundaries", () => {
    expect(countVisibleCharacters("字".repeat(350))).toBe(350);
    expect(countVisibleCharacters("字".repeat(450))).toBe(450);
  });
});

describe("paragraph rules", () => {
  it("returns trimmed non-empty paragraphs", () => {
    expect(splitNonEmptyParagraphs(" 第一段 \n\n  \n第二段\r\n 第三段 ")).toEqual([
      "第一段",
      "第二段",
      "第三段",
    ]);
  });

  it("returns no paragraphs for whitespace-only input", () => {
    expect(splitNonEmptyParagraphs(" \n\t\r\n ")).toEqual([]);
  });
});
