import { describe, expect, it } from "vitest";

import {
  AI_CONTENT_LABEL,
  composeGreetingCopy,
  countVisibleCharacters,
} from "../../shared/src/index.js";

describe("copied greeting composition", () => {
  it("puts the exact AI label on a new line", () => {
    const body = `${"字".repeat(125)}\n${"文".repeat(125)}`;
    const copied = composeGreetingCopy(`${body}\n  `);

    expect(copied).toBe(`${body}\n${AI_CONTENT_LABEL}`);
  });

  it("keeps the label outside the body character count", () => {
    const body = `${"字".repeat(125)}\n${"文".repeat(125)}`;
    const copied = composeGreetingCopy(body);
    const extractedBody = copied.slice(0, -(AI_CONTENT_LABEL.length + 1));

    expect(countVisibleCharacters(extractedBody)).toBe(250);
    expect(countVisibleCharacters(copied)).toBeGreaterThan(250);
  });
});
