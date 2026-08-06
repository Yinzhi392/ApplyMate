import { describe, expect, it } from "vitest";

import { createResultView } from "../../miniprogram/core/result-presenter.js";

describe("mini-program result presenter", () => {
  it("resolves fact and JD evidence into readable source labels", () => {
    const view = createResultView({
      applicationId: "application_1",
      greetingBody: "您好，我想应聘贵司的 AI 产品实习生岗位。",
      status: "not_applied",
      memo: "",
      warnings: ["COMPANY_NAME_MISSING"],
      omittedRequirements: ["三年以上工作经验"],
      factSnapshot: [{ factId: "fact_1", sourceType: "project", text: "完成 AI 助手项目" }],
      jdSnapshot: {
        jobTitle: { fieldId: "jd_job_title", text: "AI 产品实习生", confidence: 0.99 },
        responsibilities: [],
        hardSkills: [],
        experienceEducation: [],
        locationWorkMode: [],
        availabilityDuration: [],
      },
      evidence: [{
        claimId: "claim_1",
        text: "完成 AI 助手项目",
        sources: [
          { type: "fact", factId: "fact_1" },
          { type: "jd", fieldId: "jd_job_title" },
        ],
      }],
      copyText: "您好，我想应聘贵司的 AI 产品实习生岗位。\nAI生成内容，请核对真实性",
      manualWarnings: [],
    });

    expect(view.companyDisplayName).toBe("贵司");
    expect(view.jobTitle).toBe("AI 产品实习生");
    expect(view.claims[0]?.sourceLabels).toEqual([
      "项目：完成 AI 助手项目",
      "岗位：AI 产品实习生",
    ]);
    expect(view.warningMessages).toContain("未识别到公司名，正文已使用“贵司”。");
  });

  it("keeps unknown evidence visible as a check warning instead of crashing", () => {
    const view = createResultView({
      applicationId: "application_2",
      greetingBody: "测试正文",
      status: "applied",
      memo: "",
      warnings: [],
      omittedRequirements: [],
      factSnapshot: [],
      jdSnapshot: {
        responsibilities: [],
        hardSkills: [],
        experienceEducation: [],
        locationWorkMode: [],
        availabilityDuration: [],
      },
      evidence: [{
        claimId: "claim_unknown",
        text: "待核对陈述",
        sources: [{ type: "fact", factId: "fact_missing" }],
      }],
      copyText: "测试正文\nAI生成内容，请核对真实性",
      manualWarnings: [],
    });

    expect(view.claims[0]?.sourceLabels).toEqual(["来源待核对"]);
  });
});
