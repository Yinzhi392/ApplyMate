import { describe, expect, it } from "vitest";

import {
  createHomeView,
  createLoginView,
} from "../../miniprogram/core/presenters.js";

describe("mini-program access and home presenters", () => {
  it("combines agreement and invitation for a first-time user", () => {
    expect(createLoginView({
      accessState: "agreement_required",
      agreementChecked: true,
      inviteRequired: true,
      isAdmin: false,
      inviteCode: "APPLYMATE",
      errorMessage: "",
      justActivated: false,
    })).toMatchObject({
      actionLabel: "验证并登录",
      mode: "form",
      showAgreement: true,
      showInviteInput: true,
    });
  });

  it.each([
    ["active", false, "redirect"],
    ["active", true, "success"],
    ["disabled", false, "disabled"],
  ] as const)("maps %s with justActivated=%s to %s", (accessState, justActivated, mode) => {
    expect(createLoginView({
      accessState,
      agreementChecked: true,
      inviteRequired: false,
      isAdmin: false,
      inviteCode: "",
      errorMessage: "",
      justActivated,
    })).toMatchObject({ mode });
  });

  it("lets approved administrators skip the invitation step", () => {
    const view = createLoginView({
      accessState: "active",
      agreementChecked: true,
      inviteRequired: false,
      isAdmin: true,
      inviteCode: "",
      errorMessage: "",
      justActivated: false,
    });

    expect(view.helperText).toContain("管理员");
    expect(view.showInviteInput).toBe(false);
  });

  it("covers empty resume, exhausted quota and paused resources without record data", () => {
    const emptyResume = createHomeView({
      defaultResume: null,
      remainingQuota: 5,
      resourcePauseReason: "",
    });
    expect(emptyResume).toMatchObject({
      primaryActionLabel: "先添加简历",
      primaryActionDescription: "上传后只需核对一次个人资料",
      generationEnabled: false,
    });
    expect(emptyResume).not.toHaveProperty("recentApplications");

    expect(createHomeView({
      defaultResume: { resumeId: "resume_demo0001", name: "产品简历" },
      remainingQuota: 0,
      resourcePauseReason: "",
    })).toMatchObject({
      generationEnabled: false,
      primaryActionLabel: "提交岗位信息",
      pauseTitle: "今日次数已用完",
    });

    expect(createHomeView({
      defaultResume: { resumeId: "resume_demo0001", name: "产品简历" },
      remainingQuota: 4,
      resourcePauseReason: "模型免费额度已暂停",
    })).toMatchObject({
      generationEnabled: false,
      pauseTitle: "AI 服务暂不可用",
    });
  });
});
