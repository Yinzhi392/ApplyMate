import { describe, expect, it } from "vitest";

import { selectJdImageProfile } from "../../web/src/lib/jd-image-profile";

describe("Web JD image profile selection", () => {
  it("selects the smallest candidate that preserves at least 99% of critical fields", () => {
    expect(selectJdImageProfile([
      { profileId: "720-q80", bytes: 100, criticalFieldRetention: 0.98, hasCriticalFieldRegression: false },
      { profileId: "1080-q78", bytes: 200, criticalFieldRetention: 0.99, hasCriticalFieldRegression: false },
      { profileId: "1440-q75", bytes: 300, criticalFieldRetention: 1, hasCriticalFieldRegression: false },
    ]).id).toBe("1080-q78");
  });

  it("falls back to 1440/Q75 when every candidate fails", () => {
    expect(selectJdImageProfile([
      { profileId: "720-q80", bytes: 100, criticalFieldRetention: 0.9, hasCriticalFieldRegression: true },
    ])).toMatchObject({ id: "1440-q75", maxEdge: 1440, quality: 0.75 });
  });
});
