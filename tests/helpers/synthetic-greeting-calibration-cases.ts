function fitGoldParagraphs(
  paragraphs: string[],
  filler: string,
  range: { minimum: number; maximum: number },
): string[] {
  const visibleLength = (value: string) => value.replace(/\s+/gu, "").length;
  const fitted = [...paragraphs];
  while (visibleLength(fitted.join("\n")) < range.minimum) fitted[fitted.length - 1] += filler;
  if (visibleLength(fitted.join("\n")) > range.maximum) {
    throw new Error("Synthetic gold fixture exceeds the greeting limit.");
  }
  return fitted;
}

export const syntheticGreetingCalibrationCases = {
  investment: {
    jd: "澄明资本战略投资实习生：负责行业研究、公司基本面分析、估值建模和投资报告，使用DCF与WACC进行估值分析，金融相关专业在读，每周到岗三天。",
    facts: [
      { factId: "fact_investment", sourceType: "project", text: "独立完成星河食品行业研究、财务预测、DCF、WACC、敏感性分析和投资报告" },
      { factId: "fact_equity", sourceType: "project", text: "完成海外上市公司 CAPM、Beta、PE 与风险收益分析" },
      { factId: "fact_school", sourceType: "education", text: "南方理工大学金融科技专业在读，专业排名前百分之五" },
      { factId: "fact_availability", sourceType: "preference", text: "每周可稳定投入三天，可连续实习四个月" },
      { factId: "fact_ai", sourceType: "experience", text: "参与对话模型质量评测" },
    ],
    expectedFamily: "investment_research",
    expectedFirstFactId: "fact_investment",
    expected: {
      matchMode: "strong",
      directFactIds: ["fact_investment", "fact_equity"],
      transferableFactIds: [],
      requiredPhrases: ["金融科技", "DCF", "WACC", "每周"],
      forbiddenPhrases: ["分析练习", "贴近真实工作", "AI 对话评测"],
    },
    modelOutput: {
      jobTitle: "战略投资实习生",
      companyName: "澄明资本",
      responsibilities: ["负责行业研究和公司基本面分析", "估值建模和投资报告"],
      hardSkills: ["使用 DCF 与 WACC 进行估值分析"],
      experienceEducation: ["金融相关专业在读"],
      locationWorkMode: [],
      availabilityDuration: ["每周到岗三天"],
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "行业与公司研究" },
        { requirementType: "responsibilities", requirementIndex: 1, summary: "估值建模与投资报告" },
      ],
      domainContext: ["投资"],
      matchMode: "strong",
      directFactIds: ["fact_investment", "fact_equity"],
      transferableEvidence: [],
      supportingFactIds: ["fact_school", "fact_availability"],
      gaps: [],
      paragraphs: fitGoldParagraphs([
        "您好，我是金融科技专业本科生，专业排名前百分之五，希望加入澄明资本并应聘战略投资实习生。",
        "我独立完成过星河食品的完整投资研究，从行业格局、公司基本面和财务预测出发，进一步搭建DCF估值框架、测算WACC并完成敏感性分析，最终输出投资报告。",
        "我也完成过海外上市公司的CAPM、Beta、PE与风险收益分析。",
        "我每周可稳定投入三天，并可连续实习四个月，希望有机会进一步沟通岗位中的研究任务和交付要求。",
      ], "我会把财务预测、敏感性分析和投资判断整理成完整投资报告。", { minimum: 550, maximum: 800 }),
    },
  },
  financialAiAgent: {
    jd: "远景科技金融 AI Agent 产品实习生：负责模型评测、评测Case体系、Badcase归因、A/B Test、Prompt与Agent策略优化，要求理解大模型评测方法，具备数据分析与结构化归纳能力，金融相关专业优先。",
    facts: [
      { factId: "fact_dcf", sourceType: "project", text: "完成消费公司 DCF 估值分析" },
      { factId: "fact_eval", sourceType: "experience", text: "参与五千余条合成对话 Case 的质量复核、模型评测、失败归因和 Prompt A/B Test" },
      { factId: "fact_product", sourceType: "project", text: "独立完成生成式 AI 消费分析产品的需求拆解、Prompt 设计、测试和部署" },
      { factId: "fact_fintech", sourceType: "education", text: "南方理工大学金融科技专业在读" },
    ],
    expectedFamily: "ai_evaluation_product",
    expectedFirstFactId: "fact_eval",
    expected: {
      matchMode: "strong",
      directFactIds: ["fact_eval", "fact_product"],
      transferableFactIds: [],
      requiredPhrases: ["模型评测", "失败", "Prompt", "AI 产品"],
      forbiddenPhrases: ["AI 投研", "投研知识库", "研报提取", "DCF"],
    },
    modelOutput: {
      jobTitle: "金融 AI Agent 产品实习生",
      companyName: "远景科技",
      responsibilities: ["建设模型评测和评测 Case 体系", "开展 Badcase 归因与 A/B Test", "优化 Prompt 与 Agent 策略"],
      hardSkills: ["理解大模型评测方法", "具备数据分析与结构化归纳能力"],
      experienceEducation: ["金融相关专业优先"],
      locationWorkMode: [],
      availabilityDuration: [],
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "模型评测与 Case 体系" },
        { requirementType: "responsibilities", requirementIndex: 1, summary: "Badcase 归因与实验" },
        { requirementType: "responsibilities", requirementIndex: 2, summary: "Prompt 与 Agent 优化" },
      ],
      domainContext: ["金融"],
      matchMode: "strong",
      directFactIds: ["fact_eval", "fact_product"],
      transferableEvidence: [],
      supportingFactIds: ["fact_fintech"],
      gaps: [],
      paragraphs: fitGoldParagraphs([
        "您好，我是一名有模型评测和生成式AI产品实践的金融科技专业本科生，希望应聘远景科技的金融AI Agent产品实习生。",
        "我参与过五千余条合成对话Case的质量复核、模型评测、失败归因和Prompt A/B Test。",
        "我还独立完成过生成式AI消费分析产品，从需求拆解、Prompt设计到测试和部署完整推进。",
        "我参与过五千余条合成对话Case的质量复核、模型评测、失败归因和Prompt A/B Test，这些实践与岗位的模型评测、Case体系和Badcase归因职责高度契合。",
      ], "我参与五千余条合成对话Case的质量复核、模型评测、失败归因和Prompt A/B Test。", { minimum: 550, maximum: 800 }),
    },
  },
  seo: {
    jd: "远航网络SEO经理：要求熟悉搜索引擎机制，能够独立进行关键词研究、自然排名优化和搜索数据监测。",
    facts: [
      { factId: "fact_web", sourceType: "project", text: "独立完成 Web 产品页面搭建、测试、修复和部署" },
      { factId: "fact_data", sourceType: "skill", text: "使用 SQL、表格和可视化工具进行数据分析" },
      { factId: "fact_iteration", sourceType: "experience", text: "根据业务指标定位问题并通过 A/B Test 验证优化结果" },
      { factId: "fact_english", sourceType: "education", text: "具有英文资料检索和阅读能力" },
    ],
    expectedFamily: "seo_growth",
    expectedFirstFactId: "fact_web",
    expected: {
      matchMode: "partial",
      directFactIds: [],
      transferableFactIds: ["fact_web", "fact_data", "fact_iteration"],
      requiredPhrases: ["Web产品", "数据", "业务指标", "A/B Test"],
      forbiddenPhrases: ["熟悉SEO", "独立开展关键词研究", "提升自然流量", "Google Search Console", "缺少相关经验", "没有完整负责过SEO", "不完全匹配"],
    },
    modelOutput: {
      jobTitle: "SEO经理",
      companyName: "远航网络",
      responsibilities: ["独立进行关键词研究", "自然排名优化和搜索数据监测"],
      hardSkills: ["独立进行关键词研究", "熟悉自然排名优化"],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "关键词研究" },
        { requirementType: "responsibilities", requirementIndex: 1, summary: "自然排名优化和搜索数据监测" },
      ],
      domainContext: ["搜索引擎"],
      matchMode: "partial",
      directFactIds: [],
      transferableEvidence: [
        { factId: "fact_web", capability: "网站落地流程基础", wordingStrength: "transferable" },
        { factId: "fact_data", capability: "数据分析基础", wordingStrength: "foundation" },
        { factId: "fact_iteration", capability: "数据驱动实验迭代", wordingStrength: "transferable" },
      ],
      supportingFactIds: ["fact_english"],
      gaps: ["没有完整负责过SEO项目和关键词研究"],
      paragraphs: fitGoldParagraphs([
        "您好，我希望应聘远航网络的SEO经理。我独立完成过Web产品页面搭建、测试、修复和部署。",
        "我独立完成过Web产品页面搭建、测试、修复和部署。",
        "我会使用SQL、表格和可视化工具进行数据分析；我也根据业务指标定位问题并通过A/B Test验证优化结果。岗位要求搜索数据监测和自然排名优化。",
        "我具有英文资料检索和阅读能力，也根据业务指标定位问题并通过A/B Test验证优化结果。",
      ], "我根据业务指标定位问题并通过A/B Test验证优化结果。", { minimum: 350, maximum: 550 }),
    },
  },
} as const;
