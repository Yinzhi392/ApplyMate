import { describe, expect, it } from "vitest";

import {
  deriveServiceSchedule,
  resolveServiceAccess,
  type ServiceSchedule,
} from "../../shared/src/service-access";

const schedule: ServiceSchedule = {
  publicLaunchAt: "2026-09-01T00:00:00+08:00",
  aiClosesAt: "2026-11-01T00:00:00+08:00",
  dataAccessEndsAt: "2027-03-01T00:00:00+08:00",
};

describe("public service lifecycle", () => {
  it("moves through active, read-only and retired at the configured instants", () => {
    expect(resolveServiceAccess(schedule, new Date("2026-10-31T23:59:59+08:00"), {
      budgetPaused: false,
      resourcePaused: false,
    })).toMatchObject({ phase: "active", aiAvailability: "available" });
    expect(resolveServiceAccess(schedule, new Date("2026-11-01T00:00:00+08:00"), {
      budgetPaused: false,
      resourcePaused: false,
    })).toMatchObject({ phase: "read_only", aiAvailability: "scheduled_closed" });
    expect(resolveServiceAccess(schedule, new Date("2027-03-01T00:00:00+08:00"), {
      budgetPaused: false,
      resourcePaused: false,
    })).toMatchObject({ phase: "retired", aiAvailability: "scheduled_closed" });
  });

  it("prioritizes the budget pause before a resource pause during the active phase", () => {
    expect(resolveServiceAccess(schedule, new Date("2026-10-01T00:00:00+08:00"), {
      budgetPaused: true,
      resourcePaused: true,
    }).aiAvailability).toBe("budget_paused");
  });

  it("derives the two- and six-calendar-month boundaries in Beijing time", () => {
    expect(deriveServiceSchedule("2026-08-31T23:30:00+08:00")).toEqual({
      publicLaunchAt: "2026-08-31T23:30:00+08:00",
      aiClosesAt: "2026-10-31T23:30:00.000+08:00",
      dataAccessEndsAt: "2027-02-28T23:30:00.000+08:00",
    });
  });
});
