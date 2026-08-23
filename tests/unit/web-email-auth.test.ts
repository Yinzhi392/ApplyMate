import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  isValidEmailCode,
  normalizeEmail,
} from "../../web/src/lib/email-auth";

describe("Web email authentication input", () => {
  it("normalizes an email without storing display-only whitespace or case", () => {
    expect(normalizeEmail("  ApplyMate67@GMAIL.COM ")).toBe("applymate67@gmail.com");
  });

  it("accepts CloudBase six-character email codes containing letters or digits", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("person@example")).toBe(false);
    expect(isValidEmailCode("123456")).toBe(true);
    expect(isValidEmailCode("h52253")).toBe(true);
    expect(isValidEmailCode("A1B2C3")).toBe(true);
    expect(isValidEmailCode("12345")).toBe(false);
    expect(isValidEmailCode("12-456")).toBe(false);
  });
});
