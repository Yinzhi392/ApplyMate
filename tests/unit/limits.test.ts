import { describe, expect, it } from "vitest";

import {
  MAX_FEEDBACK_VISIBLE_CHARACTERS,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_TOTAL_BYTES,
  MAX_PDF_PAGES,
  MAX_PREFERENCE_VISIBLE_CHARACTERS,
  MAX_RESUME_COUNT,
  MAX_SINGLE_FILE_BYTES,
  MAX_TEXT_VISIBLE_CHARACTERS,
  isWithinInclusiveLimit,
} from "../../shared/src/index.js";

const limits = [
  MAX_IMAGE_COUNT,
  MAX_SINGLE_FILE_BYTES,
  MAX_IMAGE_TOTAL_BYTES,
  MAX_PDF_PAGES,
  MAX_TEXT_VISIBLE_CHARACTERS,
  MAX_PREFERENCE_VISIBLE_CHARACTERS,
  MAX_FEEDBACK_VISIBLE_CHARACTERS,
  MAX_RESUME_COUNT,
];

describe("MVP input limits", () => {
  it("uses the approved limit values", () => {
    expect(MAX_IMAGE_COUNT).toBe(6);
    expect(MAX_SINGLE_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_IMAGE_TOTAL_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PDF_PAGES).toBe(10);
    expect(MAX_TEXT_VISIBLE_CHARACTERS).toBe(20_000);
    expect(MAX_PREFERENCE_VISIBLE_CHARACTERS).toBe(500);
    expect(MAX_FEEDBACK_VISIBLE_CHARACTERS).toBe(500);
    expect(MAX_RESUME_COUNT).toBe(3);
  });

  it.each(limits)("accepts zero and the exact maximum %i", (maximum) => {
    expect(isWithinInclusiveLimit(0, maximum)).toBe(true);
    expect(isWithinInclusiveLimit(maximum, maximum)).toBe(true);
  });

  it.each(limits)("rejects values outside the range for maximum %i", (maximum) => {
    expect(isWithinInclusiveLimit(-1, maximum)).toBe(false);
    expect(isWithinInclusiveLimit(maximum + 1, maximum)).toBe(false);
    expect(isWithinInclusiveLimit(0.5, maximum)).toBe(false);
  });
});
