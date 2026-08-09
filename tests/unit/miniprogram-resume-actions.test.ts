import { describe, expect, it } from "vitest";

import { createResumeActions } from "../../miniprogram/core/resume-actions.js";

describe("mini-program resume actions", () => {
  it("offers confirmation and deletion for an unconfirmed resume", () => {
    expect(createResumeActions({ isDefault: false, status: "awaiting_confirmation" })).toEqual([
      { label: "继续核对", type: "continue_confirmation" },
      { label: "删除", type: "delete" },
    ]);
  });

  it("offers default selection and deletion for a confirmed non-default resume", () => {
    expect(createResumeActions({ isDefault: false, status: "confirmed" })).toEqual([
      { label: "设为默认", type: "set_default" },
      { label: "删除", type: "delete" },
    ]);
  });

  it("keeps only deletion for the current default resume", () => {
    expect(createResumeActions({ isDefault: true, status: "confirmed" })).toEqual([
      { label: "删除", type: "delete" },
    ]);
  });
});
