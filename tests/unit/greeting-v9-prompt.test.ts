import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(__filename);
const worker = require("../../cloudfunctions/worker/deploy/experience-worker.js") as {
  containsMechanicalGreetingPhrase(value: string): boolean;
  jdPrompt(
    text: string,
    facts: Array<{ factId: string; sourceType: string; text: string }>,
  ): string;
  modelGreetingPackageWithLocalValidation(
    selection: Record<string, unknown>,
    jd: Record<string, unknown>,
    facts: Array<{ factId: string; sourceType: string; text: string }>,
  ): unknown;
  resolveGreetingGeneration(input: {
    rawText: string;
    facts: Array<{ factId: string; sourceType: string; text: string }>;
    modelCall: (prompt: string, options: Record<string, unknown>) => Promise<unknown>;
  }): Promise<{ generationMode: string }>;
};

const baseFacts = [
  {
    factId: "fact_project",
    sourceType: "project",
    text: "参与AI对话数据质量复核，归纳Badcase并推动Prompt优化和A/B测试",
  },
  {
    factId: "fact_availability",
    sourceType: "preference",
    text: "可连续实习四个月，每周到岗四天，可远程配合",
  },
];

describe("greeting prompt v9 product contract", () => {
  it("defines the strong, partial, and low adaptive tiers", () => {
    const prompt = worker.jdPrompt("示例科技招聘AI产品实习生", baseFacts);

    expect(prompt).toContain("Prompt版本：experience-evidence-adaptive-v9");
    expect(prompt).toMatch(/strong[^\n]*550至800[^\n]*4至5/u);
    expect(prompt).toMatch(/partial[^\n]*350至550[^\n]*3至4/u);
    expect(prompt).toMatch(/low[^\n]*180至350[^\n]*2至3/u);
  });

  it("limits experience and numeric evidence while placing availability last", () => {
    const prompt = worker.jdPrompt("示例科技招聘AI产品实习生", baseFacts);

    expect(prompt).toContain("匹配度最高的2至3段经历");
    expect(prompt).toContain("最有说服力的2至3个有来源数字");
    expect(prompt).toContain("到岗时间、实习月数、每周到岗天数和远程或线下条件统一放在最后一个非空段落");
    expect(prompt).toContain("不得写用户真实姓名");
  });

  it("keeps gaps internal and explicitly bans weakness disclosure", () => {
    const prompt = worker.jdPrompt("示例科技招聘AI产品实习生", baseFacts);

    expect(prompt).toContain("gaps仅用于内部记录，绝不能写入正文");
    expect(prompt).toContain("没有直接经验时，只积极且准确地呈现可迁移能力、相关实践和有证据的学习行动");

    for (const phrase of [
      "虽然我没有直接经验，但是我会努力",
      "我缺少相关经验",
      "我暂时没有对口经历",
      "我的经历与岗位不完全匹配",
      "希望弥补不足",
    ]) {
      expect(worker.containsMechanicalGreetingPhrase(phrase)).toBe(true);
    }
  });

  it("uses only explicit education advantage evidence instead of inferring school tier", () => {
    const genericEducationPrompt = worker.jdPrompt("示例科技招聘AI产品实习生", [
      ...baseFacts,
      {
        factId: "fact_education",
        sourceType: "education",
        text: "示例大学金融科技专业本科在读，GPA 3.6",
      },
    ]);
    const preferredEducationPrompt = worker.jdPrompt("示例科技招聘AI产品实习生", [
      ...baseFacts,
      {
        factId: "fact_education_preference",
        sourceType: "preference",
        text: "教育背景是我的求职优势，请在开场白中简短突出",
      },
    ]);
    const rankedEducationPrompt = worker.jdPrompt("示例科技招聘AI产品实习生", [
      ...baseFacts,
      {
        factId: "fact_education_rank",
        sourceType: "education",
        text: "金融科技专业本科在读，专业排名前5%并获得一等奖学金",
      },
    ]);

    expect(genericEducationPrompt).toContain("教育背景策略：不得写学校名称、GPA或学校层次评价");
    expect(preferredEducationPrompt).toContain("教育背景策略：用户已明确标记教育背景为优势");
    expect(rankedEducationPrompt).toContain("教育背景策略：事实中存在前5%或突出奖学金等明确优势");
    expect(genericEducationPrompt).toContain("不得推测或评价中国学校层次");
  });

  it("allocates enough output budget for the longest tier without a second call", async () => {
    const modelCall = vi.fn(async (
      _prompt: string,
      _options: Record<string, unknown>,
    ) => ({
      jobTitle: "AI产品实习生",
      companyName: "示例科技",
      responsibilities: ["负责AI产品质量评测与迭代"],
      hardSkills: ["能够归纳Badcase并优化Prompt"],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "AI产品质量评测" },
        { requirementType: "hardSkills", requirementIndex: 0, summary: "Badcase归纳与Prompt优化" },
      ],
      domainContext: [],
      matchMode: "strong",
      directFactIds: ["fact_project"],
      transferableEvidence: [],
      supportingFactIds: ["fact_availability"],
      gaps: [],
      paragraphs: [
        "您好，我是一名有AI产品和模型评测经验的在读学生，想申请示例科技的AI产品实习生岗位。",
        "我参与过AI对话数据质量复核，围绕结果准确性归纳Badcase，并推动Prompt优化和A/B测试；这段经历与岗位中的AI产品质量评测和迭代工作直接相关。",
        "我可连续实习四个月，每周到岗四天，也可远程配合。",
      ],
    }));

    const result = await worker.resolveGreetingGeneration({
      rawText: "示例科技招聘AI产品实习生，负责AI产品质量评测与迭代，要求能够归纳Badcase并优化Prompt。",
      facts: baseFacts,
      modelCall,
    });

    expect(result.generationMode).toBe("model");
    expect(modelCall).toHaveBeenCalledTimes(1);
    expect(modelCall.mock.calls[0]?.[1]).toMatchObject({
      maxTokens: 2_200,
    });
  });

  it("rejects confirmed availability details before the final paragraph", () => {
    const selection = {
      jobTitle: "AI产品实习生",
      companyName: "示例科技",
      matchMode: "strong",
      directFactIds: ["fact_project"],
      transferableEvidence: [],
      supportingFactIds: ["fact_availability"],
      gaps: [],
      paragraphs: [
        "您好，我想申请示例科技的AI产品实习生岗位，可连续实习四个月，每周到岗四天。",
        "我参与AI对话数据质量复核，归纳Badcase并推动Prompt优化和A/B测试。",
        "这段经历与岗位中的AI产品质量评测工作直接相关。",
      ],
    };
    const jd = {
      jobTitle: { fieldId: "jd_title", text: "AI产品实习生" },
      companyName: { fieldId: "jd_company", text: "示例科技" },
      responsibilities: [
        { fieldId: "jd_responsibility", text: "负责AI产品质量评测" },
      ],
      hardSkills: [],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
    };

    try {
      worker.modelGreetingPackageWithLocalValidation(selection, jd, baseFacts);
      throw new Error("Expected early availability details to be rejected.");
    } catch (error) {
      expect(error).toMatchObject({
        message: "MODEL_INVALID_OUTPUT",
        validationGate: "greeting_availability_position",
      });
    }
  });

  it("accepts a two-paragraph low match with positive foundation evidence", () => {
    const lowFacts = [
      {
        factId: "fact_foundation",
        sourceType: "project",
        text: "在课程项目中使用表格整理用户反馈，并记录每次调整结果",
      },
      {
        factId: "fact_low_availability",
        sourceType: "preference",
        text: "可连续实习三个月，每周到岗三天",
      },
    ];
    const selection = {
      jobTitle: "用户运营实习生",
      companyName: "示例科技",
      matchMode: "low",
      directFactIds: [],
      transferableEvidence: [
        {
          factId: "fact_foundation",
          capability: "用户反馈整理与迭代记录基础",
          wordingStrength: "foundation",
        },
      ],
      supportingFactIds: ["fact_low_availability"],
      gaps: ["缺少与核心职责完全对应的已确认经历"],
      paragraphs: [
        "您好，我是有用户反馈整理实践的在读学生，希望申请示例科技的用户运营实习生岗位；我在课程项目中使用表格整理用户反馈，并记录每次调整结果。",
        "我可连续实习三个月，每周到岗三天。",
      ],
    };
    const jd = {
      jobTitle: { fieldId: "jd_low_title", text: "用户运营实习生" },
      companyName: { fieldId: "jd_low_company", text: "示例科技" },
      responsibilities: [
        { fieldId: "jd_low_responsibility", text: "负责用户反馈整理和运营复盘" },
      ],
      hardSkills: [],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
    };

    expect(
      worker.modelGreetingPackageWithLocalValidation(selection, jd, lowFacts),
    ).toMatchObject({
      selection: {
        matchMode: "low",
        transferableEvidence: [
          expect.objectContaining({ wordingStrength: "foundation" }),
        ],
      },
      greetingPackage: {
        body: expect.not.stringMatching(/缺少|不完全匹配|弥补不足/u),
      },
    });
  });
});
