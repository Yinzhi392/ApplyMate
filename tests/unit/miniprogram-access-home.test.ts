import { describe, expect, it } from "vitest";

import {
  createHomeView,
  createLoginView,
} from "../../miniprogram/core/presenters.js";

describe("mini-program access and home presenters", () => {
  it.each([
    ["agreement_required", "请先阅读并同意协议", "同意并继续"],
    ["invite_required", "输入邀请码", "激活邀请码"],
    ["active", "登录成功", "进入首页"],
    ["disabled", "账号已停用", "删除账号"],
  ] as const)("maps %s to an actionable access state", (accessState, title, actionLabel) => {
    expect(createLoginView({
      accessState,
      agreementChecked: accessState !== "agreement_required",
      isAdmin: false,
      inviteCode: "",
      errorMessage: "",
    })).toMatchObject({ title, actionLabel });
  });

  it("lets approved administrators skip the invitation step", () => {
    const view = createLoginView({
      accessState: "active",
      agreementChecked: true,
      isAdmin: true,
      inviteCode: "",
      errorMessage: "",
    });

    expect(view.helperText).toContain("管理员");
    expect(view.showInviteInput).toBe(false);
  });

  it("covers empty resume, exhausted quota, paused resources and recent records", () => {
    expect(createHomeView({
      defaultResume: null,
      remainingQuota: 5,
      resourcePauseReason: "",
      recentApplications: [],
    })).toMatchObject({
      primaryActionLabel: "先添加简历",
      generationEnabled: false,
      emptyRecentRecords: true,
    });

    expect(createHomeView({
      defaultResume: { resumeId: "resume_demo0001", name: "产品简历" },
      remainingQuota: 0,
      resourcePauseReason: "",
      recentApplications: [],
    })).toMatchObject({ generationEnabled: false, pauseTitle: "今日次数已用完" });

    expect(createHomeView({
      defaultResume: { resumeId: "resume_demo0001", name: "产品简历" },
      remainingQuota: 4,
      resourcePauseReason: "模型免费额度已暂停",
      recentApplications: [{
        applicationId: "application_1",
        jobTitle: "AI 产品实习生",
        companyName: "贵司",
        status: "not_applied",
        updatedAt: "2026-08-06T00:00:00.000Z",
      }],
    })).toMatchObject({
      generationEnabled: false,
      pauseTitle: "AI 服务暂不可用",
      emptyRecentRecords: false,
    });
  });
});
