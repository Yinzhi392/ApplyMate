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

  it("rejects unknown facts but safely replaces core functions from another JD", () => {
    expect(() =>
      calibration.normalizeGreetingPlan(
        { ...plan, directFactIds: ["fact_unknown"] },
        { facts, jd, rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
    const outOfRange = calibration.normalizeGreetingPlan(
        {
          ...plan,
          coreFunctions: [
            ...plan.coreFunctions.slice(0, 1),
            { requirementType: "responsibilities", requirementIndex: 9, summary: "投研知识库" },
          ],
        },
        { facts, jd: structuredClone(jd), rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      );
    const pollutedSummary = calibration.normalizeGreetingPlan(
        {
          ...plan,
          coreFunctions: [
            plan.coreFunctions[0],
            { requirementType: "responsibilities", requirementIndex: 1, summary: "投研知识库" },
          ],
        },
        { facts, jd: structuredClone(jd), rawJdText: "示例科技招聘模型评测产品实习生，负责模型效果评测和Badcase归因。" },
      );
    expect(outOfRange.coreFunctions).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ summary: "投研知识库" }),
    ]));
    expect(pollutedSummary.coreFunctions).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ summary: "投研知识库" }),
    ]));
  });

  it("accepts faithful JD paraphrases while rejecting cross-JD and invented numeric fields", () => {
    const rawJdText = [
      "示例科技招聘模型评测产品实习生。",
      "结合真实用户交互数据，通过人工抽检和指标监控分析模型在不同场景下的表现差异。",
      "针对模型幻觉、策略失效、对话不合理等问题进行归因分析，推动Prompt策略持续优化。",
    ].join("");
    const paraphrasedJd = {
      ...jd,
      responsibilities: [
        { fieldId: "jd_eval", text: "围绕真实用户对话持续分析模型表现并归纳失败原因" },
        { fieldId: "jd_prompt", text: "通过指标监控持续推动提示词策略优化" },
      ],
    };
    const paraphrasedPlan = {
      ...plan,
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "分析模型表现并归纳失败原因" },
        { requirementType: "responsibilities", requirementIndex: 1, summary: "指标监控与提示词策略优化" },
      ],
    };

    expect(() => calibration.normalizeGreetingPlan(
      paraphrasedPlan,
      { facts, jd: paraphrasedJd, rawJdText },
    )).not.toThrow();

    for (const unsupportedText of [
      "负责投研知识库与研报提取",
      "每周到岗5天并连续实习6个月",
    ]) {
      const localJd = {
        ...paraphrasedJd,
        responsibilities: [
          paraphrasedJd.responsibilities[0],
          { fieldId: "jd_unsupported", text: unsupportedText },
        ],
      };
      expect(() => calibration.normalizeGreetingPlan(
        paraphrasedPlan,
        {
          facts,
          jd: localJd,
          rawJdText,
        },
      )).not.toThrow();
      expect(localJd.responsibilities).toEqual([
        paraphrasedJd.responsibilities[0],
      ]);
    }
  });

  it("keeps grounded core JD fields when an unused extracted field is unsupported", () => {
    const rawJdText = [
      "示例科技招聘投资分析实习生，岗位要求熟悉资本市场投资分析。",
      "协助完成行业研究，并参与金融AIAgent产品建设。",
    ].join("");
    const localJd = {
      jobTitle: { fieldId: "jd_title", text: "投资分析实习生" },
      companyName: { fieldId: "jd_company", text: "示例科技" },
      responsibilities: [
        { fieldId: "jd_capital", text: "熟悉资本市场投资分析" },
        { fieldId: "jd_agent", text: "参与金融 AI Agent 产品建设" },
        { fieldId: "jd_polluted", text: "主导校园招聘增长项目" },
      ],
      hardSkills: [],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
    };
    const localPlan = {
      ...plan,
      jobTitle: "投资分析实习生",
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "资本市场投资分析" },
        { requirementType: "responsibilities", requirementIndex: 1, summary: "金融 AI Agent 产品建设" },
      ],
    };

    expect(() => calibration.normalizeGreetingPlan(
      localPlan,
      { facts, jd: localJd, rawJdText },
    )).not.toThrow();
    expect(localJd.responsibilities.map(({ fieldId }) => fieldId)).toEqual([
      "jd_capital",
      "jd_agent",
    ]);
  });

  it("degrades ungrounded target fields instead of rejecting the whole greeting", () => {
    const rawJdText = "示例科技招聘战略投资实习生，负责模型效果评测和Badcase归因。";
    const localJd = {
      ...jd,
      jobTitle: { fieldId: "jd_title", text: "投资分析实习生" },
      companyName: { fieldId: "jd_company", text: "错误公司" },
    };
    const localPlan = {
      ...plan,
      jobTitle: "投资分析实习生",
      companyName: "错误公司",
      paragraphs: [
        "您好，我希望应聘错误公司的投资分析实习生。",
        "我参与过模型评测。",
        "期待进一步沟通。",
      ],
    };

    expect(calibration.normalizeGreetingPlan(
      localPlan,
      { facts, jd: localJd, rawJdText },
    )).toMatchObject({
      jobTitle: "该岗位",
      companyName: "",
      paragraphs: [
        "您好，我希望应聘贵司的该岗位。",
        "我参与过模型评测。",
        "期待进一步沟通。",
      ],
    });
    expect(localJd).not.toHaveProperty("jobTitle");
    expect(localJd).not.toHaveProperty("companyName");
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
