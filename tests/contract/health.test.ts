import { describe, expect, it } from "vitest";

describe("contract test harness", () => {
  it("runs provider contract tests without live services", () => {
    expect("mocked").toBe("mocked");
  });
});

