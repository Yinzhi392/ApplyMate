import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { GREETING_MATCH_PLAN_KEYS } from "../../shared/src/greeting-match-plan.js";

const require = createRequire(__filename);
const calibration = require("../../cloudfunctions/worker/deploy/greeting-calibration.js") as {
  PLAN_KEYS: readonly string[];
  collectGreetingFactIds(plan: Record<string, unknown>): string[];
  normalizeGreetingPlan(
    input: unknown,
    context: {
      facts: Array<{ factId: string; text: string }>;
      jd: Record<string, unknown>;
      rawJdText: string;
    },
  ): Record<string, unknown>;
  assertDomainTermsSupported(
    body: string,
    sources: { jdText: string; factTexts: string[] },
  ): void;
  assertNamedTermsSupported(
    body: string,
    sources: { companyName: string; factTexts: string[] },
  ): void;
  assertParagraphWording(paragraph: string, tier: string, blockedTerms: string[]): void;
};

const facts = [
  { factId: "fact_eval", text: "参与模型评测与失败 Case 归因" },
  { factId: "fact_web", text: "独立完成网站页面搭建与部署" },
  { factId: "fact_school", text: "南方理工大学金融科技专业在读" },
];

const jd = {
  jobTitle: { fieldId: "jd_title", text: "模型评测产品实习生" },
  companyName: { fieldId: "jd_company", text: "示例科技" },
  responsibilities: [
    { fieldId: "jd_eval", text: "负责模型效果评测" },
    { fieldId: "jd_badcase", text: "开展 Badcase 归因" },
  ],
  hardSkills: [],
  experienceEducation: [],
  locationWorkMode: [],
  availabilityDuration: [],
};

const plan = {
  jobTitle: "模型评测产品实习生",
  companyName: "示例科技",
  coreFunctions: [
    { requirementType: "responsibilities", requirementIndex: 0, summary: "模型效果评测" },
    { requirementType: "responsibilities", requirementIndex: 1, summary: "Badcase 归因" },
  ],
  domainContext: [],
  matchMode: "strong",
  directFactIds: ["fact_eval"],
  transferableEvidence: [],
  supportingFactIds: ["fact_school"],
  gaps: [],
  paragraphs: ["您好，我是金融科技专业在读学生。", "我参与过模型评测。", "希望进一步沟通。"],
};

describe("production greeting calibration", () => {
  it("keeps CommonJS and shared contract keys identical", () => {
    expect(calibration.PLAN_KEYS).toEqual(GREETING_MATCH_PLAN_KEYS);
  });

  it("normalizes a sourced plan and preserves evidence order", () => {
    const rawJdText = "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。";
    expect(calibration.normalizeGreetingPlan(plan, { facts, jd, rawJdText })).toMatchObject(plan);
    expect(calibration.collectGreetingFactIds(plan)).toEqual(["fact_eval", "fact_school"]);
  });

  it("rejects unknown facts and core functions from another JD", () => {
    expect(() =>
      calibration.normalizeGreetingPlan(
        { ...plan, directFactIds: ["fact_unknown"] },
        { facts, jd, rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
    expect(() =>
      calibration.normalizeGreetingPlan(
        {
          ...plan,
          coreFunctions: [
            ...plan.coreFunctions.slice(0, 1),
            { requirementType: "responsibilities", requirementIndex: 9, summary: "投研知识库" },
          ],
        },
        { facts, jd, rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
    expect(() =>
      calibration.normalizeGreetingPlan(
        {
          ...plan,
          coreFunctions: [
            plan.coreFunctions[0],
            { requirementType: "responsibilities", requirementIndex: 1, summary: "投研知识库" },
          ],
        },
        { facts, jd, rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
  });

  it("rejects duplicate core-function references", () => {
    expect(() =>
      calibration.normalizeGreetingPlan(
        {
          ...plan,
          coreFunctions: [
            plan.coreFunctions[0],
            { ...plan.coreFunctions[0], summary: "模型评测" },
          ],
        },
        { facts, jd, rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
  });

  it("accepts only honest low-match plans with background evidence", () => {
    const lowPlan = {
      ...plan,
      matchMode: "low",
      directFactIds: [],
      transferableEvidence: [],
      supportingFactIds: ["fact_school"],
      gaps: ["缺少模型评测直接经历"],
    };
    const rawJdText = "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。";
    expect(calibration.normalizeGreetingPlan(lowPlan, { facts, jd, rawJdText })).toMatchObject(
      lowPlan,
    );
    expect(() =>
      calibration.normalizeGreetingPlan(
        { ...lowPlan, supportingFactIds: [], gaps: [] },
        { facts, jd, rawJdText },
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
  });

  it("rejects cross-JD domain terms absent from current inputs", () => {
    expect(() =>
      calibration.assertDomainTermsSupported("负责投研知识库与研报提取", {
        jdText: JSON.stringify(jd),
        factTexts: facts.map(({ text }) => text),
      }),
    ).toThrow("MODEL_INVALID_OUTPUT");
  });

  it("rejects unsupported schools, methods, tools, and certifications", () => {
    for (const body of [
      "我就读于北岭大学。",
      "我熟练使用Python完成分析。",
      "我已取得证券从业资格。",
    ]) {
      expect(() =>
        calibration.assertNamedTermsSupported(body, {
          companyName: "示例科技",
          factTexts: facts.map(({ text }) => text),
        }),
      ).toThrow("MODEL_INVALID_OUTPUT");
    }
  });

  it("accepts supported school and company names in natural sentences", () => {
    for (const body of [
      "您好，我就读于南方理工大学金融科技专业。",
      "您好，我来自南方理工大学。",
      "您好，我是南方理工大学金融科技专业在读。",
      "您好，我目前是南方理工大学金融科技专业在读。",
    ]) {
      expect(() =>
        calibration.assertNamedTermsSupported(body, {
          companyName: "示例科技",
          factTexts: facts.map(({ text }) => text),
        }),
      ).not.toThrow();
    }

    expect(() =>
      calibration.assertNamedTermsSupported("您好，我关注示例科技有限公司的岗位。", {
        companyName: "示例科技有限公司",
        factTexts: facts.map(({ text }) => text),
      }),
    ).not.toThrow();
  });

  it("rejects organizations that only share a suffix with a supported name", () => {
    expect(() =>
      calibration.assertNamedTermsSupported("您好，我就读于华东理工大学。", {
        companyName: "示例科技",
        factTexts: ["北京理工大学金融科技专业在读"],
      }),
    ).toThrow("MODEL_INVALID_OUTPUT");

    expect(() =>
      calibration.assertNamedTermsSupported("您好，我关注虚构科技有限公司的岗位。", {
        companyName: "真实科技有限公司",
        factTexts: facts.map(({ text }) => text),
      }),
    ).toThrow("MODEL_INVALID_OUTPUT");
  });

  it("does not mistake ordinary English product names for valuation terms", () => {
    expect(() =>
      calibration.assertNamedTermsSupported("我长期使用 OpenAI 产品辅助研究。", {
        companyName: "示例科技",
        factTexts: facts.map(({ text }) => text),
      }),
    ).not.toThrow();
  });

  it("rejects direct-experience wording for transferable evidence", () => {
    for (const paragraph of [
      "我独立负责过完整 SEO 策略制定并提升自然流量。",
      "我有SEO经验。",
      "我做过SEO优化。",
      "我没有SEO经验，但精通SEO策略。",
      "我不仅做过SEO优化。",
      "我不是没有做过SEO项目。",
    ]) {
      expect(() =>
        calibration.assertParagraphWording(paragraph, "transferable", ["SEO", "自然流量"]),
      ).toThrow("MODEL_INVALID_OUTPUT");
    }
    expect(() =>
      calibration.assertParagraphWording(
        "网站实操和数据分析方法具备一定迁移基础。",
        "transferable",
        ["SEO", "自然流量"],
      ),
    ).not.toThrow();
    expect(() =>
      calibration.assertParagraphWording(
        "虽然我没有完整负责过SEO项目，但网站实操和数据分析能力具备迁移基础。",
        "transferable",
        ["SEO", "自然流量"],
      ),
    ).not.toThrow();
  });
});
