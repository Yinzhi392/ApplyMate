import { describe, expect, it } from "vitest";

import { MAX_TEXT_VISIBLE_CHARACTERS } from "../../shared/src/index.js";
import { ResumeTextValidationService } from "../../cloudfunctions/api/src/index.js";

describe("pasted resume text validation", () => {
  it("accepts exactly 20000 visible characters and trims outer whitespace", () => {
    const text = `  ${"简".repeat(MAX_TEXT_VISIBLE_CHARACTERS)}\n`;

    expect(new ResumeTextValidationService().validate(text)).toBe(
      "简".repeat(MAX_TEXT_VISIBLE_CHARACTERS),
    );
  });

  it.each(["", " \n\t "])("rejects empty input", (text) => {
    expect(() => new ResumeTextValidationService().validate(text)).toThrowError(
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("rejects more than 20000 visible characters and invalid Unicode", () => {
    expect(() =>
      new ResumeTextValidationService().validate(
        "简".repeat(MAX_TEXT_VISIBLE_CHARACTERS + 1),
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() =>
      new ResumeTextValidationService().validate("valid\ud800invalid"),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });
});
