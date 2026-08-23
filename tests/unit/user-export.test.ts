import { describe, expect, it } from "vitest";

import {
  InMemoryUserExportRepository,
  UserExportService,
} from "../../cloudfunctions/api/src/user-export-service";

describe("versioned user export", () => {
  it("paginates only the current user's records and removes identity fields recursively", async () => {
    const service = new UserExportService(new InMemoryUserExportRepository([
      { collection: "applications", recordId: "a2", userId: "user_a", data: { greetingBody: "safe", nested: { email: "hidden" } } },
      { collection: "resumes", recordId: "r1", userId: "user_a", data: { title: "resume", userId: "hidden" } },
      { collection: "resumes", recordId: "r2", userId: "user_b", data: { title: "other" } },
    ]));
    const first = await service.getPage("user_a", { limit: 1 }, new Date("2026-09-01T00:00:00Z"));
    expect(first.records).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    expect(JSON.stringify(first.records)).not.toMatch(/hidden|email|userId/u);
    const second = await service.getPage("user_a", { cursor: first.nextCursor ?? "", limit: 1 }, new Date("2026-09-01T00:00:00Z"));
    expect([...first.records, ...second.records].map(({ recordId }) => recordId).sort()).toEqual(["a2", "r1"]);
    expect(second.nextCursor).toBeNull();
  });
});
