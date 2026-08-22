import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(__filename);
const worker = require("../../cloudfunctions/worker/deploy/experience-worker.js") as {
  resolveGreetingGeneration(input: {
    rawText: string;
    facts: Array<{ factId: string; sourceType: string; text: string }>;
    modelCall: () => Promise<unknown>;
  }): Promise<{
    generationMode: string;
    greetingPackage: { body: string; warnings: string[] };
    fallbackReason: string;
  }>;
};

const facts = [
  {
    factId: "fact_school",
    sourceType: "education",
    text: "南方理工大学金融科技专业在读，专业排名前百分之五",
  },
  {
    factId: "fact_project",
    sourceType: "project",
    text: "独立完成消费公司行业研究、财务预测和估值分析，并输出完整研究报告",
  },
  {
    factId: "fact_skill",
    sourceType: "skill",
    text: "使用表格和演示工具完成数据整理、分析和报告输出",
  },
];

describe("model greeting delivery", () => {
  it("delivers a single model result after local truth and format checks", async () => {
    const modelCall = vi.fn(async () => ({
      jobTitle: "AI投研内容实习生",
      companyName: "深圳市优品投资顾问有限公司",
      paragraphs: [
        "您好！我想申请深圳市优品投资顾问有限公司的AI投研内容实习生岗位。我目前就读于南方理工大学金融科技专业，持续关注研究分析与内容表达的结合，也希望把已有的行业研究、财务预测和估值分析经验用于岗位要求中的信息梳理与内容支持。",
        "在既有项目中，我独立完成过消费公司行业研究、财务预测和估值分析，并输出完整研究报告。推进过程中，我会先拆解研究问题，再使用表格和演示工具整理数据、核对关键假设并形成清晰结论。这些经历让我能够在资料较多时保持结构化思路，也能根据反馈继续完善分析表达。",
        "我理解该岗位需要兼顾信息准确性、研究效率与协作沟通。我愿意从团队现有方法和业务重点出发，认真完成资料整理、分析支持与内容输出，并在每次交付后主动复盘改进。期待有机会进一步了解岗位安排，也希望能用踏实、清晰的工作方式为贵司团队提供稳定支持，谢谢。",
      ],
    }));
    const result = await worker.resolveGreetingGeneration({
      rawText: "招聘岗位相关职责与要求，欢迎符合条件的候选人申请。",
      facts,
      modelCall,
    });

    expect(modelCall).toHaveBeenCalledTimes(1);
    expect(result.generationMode).toBe("model");
    expect(result.fallbackReason).toBe("");
    expect(result.greetingPackage.body).toContain("深圳市优品投资顾问有限公司");
    expect(result.greetingPackage.body).not.toContain("我已确认的个人资料包括");
  });

  it("rejects a short result without making a second model request", async () => {
    const modelCall = vi.fn(async () => ({
      jobTitle: "AI投研内容实习生",
      companyName: "深圳市优品投资顾问有限公司",
      paragraphs: ["您好！我想申请贵司的该岗位。", "我有相关研究经历。"],
    }));
    await expect(worker.resolveGreetingGeneration({
      rawText: "招聘岗位相关职责与要求。",
      facts,
      modelCall,
    })).rejects.toThrow("MODEL_INVALID_OUTPUT");
    expect(modelCall).toHaveBeenCalledTimes(1);
  });

  it("does not hide technical model failures behind generic copy", async () => {
    const modelCall = vi.fn(async () => {
      throw new Error("MODEL_FAILED");
    });
    await expect(worker.resolveGreetingGeneration({
      rawText: "招聘岗位相关职责与要求。",
      facts,
      modelCall,
    })).rejects.toThrow("MODEL_FAILED");
    expect(modelCall).toHaveBeenCalledTimes(1);
  });
});
