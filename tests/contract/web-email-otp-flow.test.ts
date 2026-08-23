import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Web email OTP flow", () => {
  const cloudbase = readFileSync("web/src/lib/cloudbase.ts", "utf8");

  it("uses the SDK v3 OTP challenge instead of parsing the legacy verification response", () => {
    expect(cloudbase).toContain("signInWithOtp({ email })");
    expect(cloudbase).toContain("verifyOtp({ token: code })");
    expect(cloudbase).toContain("result.error != null");
    expect(cloudbase).toContain("loginResult.error != null");
    expect(cloudbase).not.toContain("result.error !== null");
    expect(cloudbase).not.toContain("loginResult.error !== null");
    expect(cloudbase).not.toContain("getVerification({ email })");
    expect(cloudbase).not.toContain("signInWithEmail({");
  });
});
