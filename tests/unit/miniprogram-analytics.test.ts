import { describe, expect, it } from "vitest";

import {
  ANALYTICS_STORAGE_KEY,
  createAnalyticsTracker,
} from "../../miniprogram/core/analytics.js";

describe("miniprogram analytics tracker", () => {
  it("queues metadata-only events on failure and retries them before the next event", async () => {
    const stored = new Map<string, unknown>();
    const calls: unknown[] = [];
    let fail = true;
    const tracker = createAnalyticsTracker(
      {
        write: async <T>(_action: string, payload: Record<string, unknown>) => {
          calls.push(payload);
          if (fail) {
            throw new Error("offline");
          }
          return { tracked: true } as T;
        },
      },
      {
        get: (key) => stored.get(key),
        set: (key, value) => stored.set(key, value),
      },
      () => "00000000-0000-4000-8000-000000000001",
    );

    await expect(tracker.track({ event: "greeting_copied", applicationId: "application_demo" })).resolves.toBe(false);
    expect(stored.get(ANALYTICS_STORAGE_KEY)).toEqual([
      { event: "greeting_copied", applicationId: "application_demo" },
    ]);
    expect(JSON.stringify(stored.get(ANALYTICS_STORAGE_KEY))).not.toContain("greetingBody");

    fail = false;
    await expect(tracker.track({ event: "app_opened" })).resolves.toBe(true);
    expect(calls).toEqual([
      { event: "greeting_copied", applicationId: "application_demo" },
      { event: "greeting_copied", applicationId: "application_demo" },
      { event: "app_opened" },
    ]);
    expect(stored.get(ANALYTICS_STORAGE_KEY)).toEqual([]);
  });
});
