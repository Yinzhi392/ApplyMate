import { describe, expect, it, vi } from "vitest";

import { leaveResult } from "../../miniprogram/core/result-exit.js";

describe("mini-program result exit", () => {
  it("saves a changed greeting before starting the next job", async () => {
    const events: string[] = [];

    await leaveResult(
      { currentBody: "修改后的正文", destination: "next_job", savedBody: "原正文" },
      {
        goHome: vi.fn(),
        goToNextJob: async () => { events.push("next"); },
        persist: async (body) => { events.push(`save:${body}`); },
      },
    );

    expect(events).toEqual(["save:修改后的正文", "next"]);
  });

  it("does not save unchanged text before returning home", async () => {
    const persist = vi.fn();
    const goHome = vi.fn();

    await leaveResult(
      { currentBody: "已保存正文", destination: "home", savedBody: "已保存正文" },
      { goHome, goToNextJob: vi.fn(), persist },
    );

    expect(persist).not.toHaveBeenCalled();
    expect(goHome).toHaveBeenCalledOnce();
  });

  it("stays on the result page when saving fails", async () => {
    const goHome = vi.fn();
    const goToNextJob = vi.fn();

    await expect(leaveResult(
      { currentBody: "修改后的正文", destination: "next_job", savedBody: "原正文" },
      {
        goHome,
        goToNextJob,
        persist: async () => { throw new Error("save failed"); },
      },
    )).rejects.toThrow("save failed");

    expect(goHome).not.toHaveBeenCalled();
    expect(goToNextJob).not.toHaveBeenCalled();
  });
});
