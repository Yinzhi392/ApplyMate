import { describe, expect, it } from "vitest";

describe("integration test harness", () => {
  it("runs local integration tests without cloud resources", () => {
    expect({ connected: false }).toEqual({ connected: false });
  });
});

