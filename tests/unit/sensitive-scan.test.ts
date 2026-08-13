import { describe, expect, it } from "vitest";

describe("offline sensitive information scan", () => {
  it("rejects secrets, real OpenID-like values, and unmasked production content", async () => {
    const { scanSensitiveContent } = await import(
      "../../scripts/sensitive-scan-lib.mjs"
    );
    expect(scanSensitiveContent("src/key.ts", "const key = 'sk-live-abcdefghijklmnopqrstuvwxyz123456';")).not.toEqual([]);
    expect(scanSensitiveContent("logs/prod.json", '{"openid":"oAbcdefghijklmnopqrstuvwxyz12"}')).not.toEqual([]);
    expect(scanSensitiveContent("exports/production.json", '{"resumeText":"真实正文"}')).not.toEqual([]);
  });

  it("allows documented placeholders, the project contact email, and synthetic fixtures", async () => {
    const { scanSensitiveContent } = await import(
      "../../scripts/sensitive-scan-lib.mjs"
    );
    expect(scanSensitiveContent(".env.example", "TOKENHUB_API_KEY=replace-me\n")).toEqual([]);
    expect(scanSensitiveContent("docs/contact.md", "applymate67@gmail.com\n")).toEqual([]);
    expect(
      scanSensitiveContent(
        "tests/fixtures/example.md",
        "<!-- SYNTHETIC_FIXTURE: true -->\n13800000001 fixture@example.invalid",
      ),
    ).toEqual([]);
  });
});
