import { describe, expect, it } from "vitest";

import {
  DEFAULT_DAILY_AI_LIMIT,
  getBeijingDateKey,
  getDailyQuotaLimit,
} from "../../cloudfunctions/api/src/index.js";

describe("Beijing daily quota boundary", () => {
  it("changes date only at Beijing midnight", () => {
    expect(getBeijingDateKey(new Date("2026-08-05T15:59:59.999Z"))).toBe(
      "2026-08-05",
    );
    expect(getBeijingDateKey(new Date("2026-08-05T16:00:00.000Z"))).toBe(
      "2026-08-06",
    );
    expect(getBeijingDateKey(new Date("2026-08-06T15:59:59.999Z"))).toBe(
      "2026-08-06",
    );
  });

  it("uses twenty by default and adds only the current-day temporary amount", () => {
    expect(DEFAULT_DAILY_AI_LIMIT).toBe(20);
    expect(getDailyQuotaLimit(0)).toBe(20);
    expect(getDailyQuotaLimit(3)).toBe(23);
  });
});
