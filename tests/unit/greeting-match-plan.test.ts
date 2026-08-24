import { describe, expect, it } from "vitest";

import {
  collectGreetingFactIds,
  GreetingMatchPlanSchema,
} from "../../shared/src/index.js";

const validPlan = {
  jobTitle: "模型评测产品实习生",
  companyName: "示例科技",
  coreFunctions: [
    {
      requirementType: "responsibilities",
      requirementIndex: 0,
      summary: "模型效果评测",
    },
    {
      requirementType: "responsibilities",
      requirementIndex: 1,
      summary: "Badcase 归因",
    },
  ],
  domainContext: ["金融服务"],
  matchMode: "strong",
  directFactIds: ["fact_dialogue_eval"],
  transferableEvidence: [
    {
      factId: "fact_product_project",
      capability: "AI 产品需求拆解与迭代",
      wordingStrength: "transferable",
    },
  ],
  supportingFactIds: ["fact_fintech_education"],
  gaps: [],
  paragraphs: [
    "您好，我关注贵司的模型评测产品实习生岗位。",
    "我有直接的模型效果评测经历，也能将产品项目中的需求拆解能力迁移到 Badcase 归因中。",
    "金融服务领域的学习经历帮助我理解业务语境，期待进一步沟通。",
  ],
};

describe("GreetingMatchPlanSchema", () => {
  it("accepts a strong plan and collects fact IDs by evidence layer", () => {
    const parsed = GreetingMatchPlanSchema.parse(validPlan);

    expect(collectGreetingFactIds(parsed)).toEqual([
      "fact_dialogue_eval",
      "fact_product_project",
      "fact_fintech_education",
    ]);
  });

  it("rejects a strong plan without direct evidence", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({ ...validPlan, directFactIds: [] }).success,
    ).toBe(false);
  });

  it("rejects a partial match without a gap", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        matchMode: "partial",
        directFactIds: [],
        gaps: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a partial match without transferable evidence", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        matchMode: "partial",
        directFactIds: [],
        transferableEvidence: [],
        gaps: ["缺少直接的模型评测经验"],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate fact IDs across evidence layers", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        supportingFactIds: ["fact_dialogue_eval"],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate fact IDs within direct evidence", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        directFactIds: ["fact_dialogue_eval", "fact_dialogue_eval"],
      }).success,
    ).toBe(false);
  });

  it("accepts a low match with supporting evidence and a gap", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        matchMode: "low",
        directFactIds: [],
        transferableEvidence: [],
        supportingFactIds: ["fact_fintech_education"],
        gaps: ["缺少直接的模型评测经验"],
      }).success,
    ).toBe(true);
  });

  it("accepts foundation-strength transferable evidence for a low match", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        matchMode: "low",
        directFactIds: [],
        transferableEvidence: [
          {
            factId: "fact_product_project",
            capability: "结构化拆解与复盘",
            wordingStrength: "foundation",
          },
        ],
        supportingFactIds: ["fact_fintech_education"],
        gaps: ["缺少与核心职责完全对应的已确认经历"],
      }).success,
    ).toBe(true);
  });

  it("rejects a low match without supporting evidence and a gap", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        matchMode: "low",
        directFactIds: [],
        transferableEvidence: [],
        supportingFactIds: [],
        gaps: [],
      }).success,
    ).toBe(false);
  });

  it("accepts two to five paragraphs and rejects one or six", () => {
    expect(GreetingMatchPlanSchema.safeParse(validPlan).success).toBe(true);
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        paragraphs: [...validPlan.paragraphs, "感谢您的时间。"],
      }).success,
    ).toBe(true);
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        paragraphs: validPlan.paragraphs.slice(0, 2),
      }).success,
    ).toBe(true);
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        paragraphs: validPlan.paragraphs.slice(0, 1),
      }).success,
    ).toBe(false);
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        paragraphs: [...validPlan.paragraphs, "第四段。", "第五段。", "第六段。"],
      }).success,
    ).toBe(false);
  });
});
