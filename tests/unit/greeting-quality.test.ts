import { describe, expect, it } from "vitest";

import {
  containsMechanicalGreetingPhrase,
  countVisibleCharacters,
  validateAiGreeting,
} from "../../shared/src/index.js";
import { syntheticGreetingCalibrationCases } from "../helpers/synthetic-greeting-calibration-cases.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildFactMatches,
  buildJdSnapshot,
  containsMechanicalGreetingPhrase: containsProductionMechanicalGreetingPhrase,
  createExperienceWorker,
  modelGreetingPackage,
  normalizeRewriteModel,
  persistGreetingMatchMode,
  rewritePrompt,
} = require("../../cloudfunctions/worker/deploy/experience-worker.js") as {
  buildFactMatches(
    selection: Record<string, unknown>,
    jd: Record<string, unknown>,
    facts: Array<{ factId: string; sourceType: string; text: string }>,
  ): unknown[];
  buildJdSnapshot(value: unknown): Record<string, unknown>;
  containsMechanicalGreetingPhrase(value: string): boolean;
  createExperienceWorker(dependencies: Record<string, unknown>): (
    event: { jobId: string },
  ) => Promise<{ ok: boolean; data?: { status?: string }; error?: unknown }>;
  modelGreetingPackage(
    plan: Record<string, unknown>,
    jd: Record<string, unknown>,
    matches: unknown[],
    facts: Array<{ factId: string; sourceType: string; text: string }>,
  ): {
    body: string;
    evidence: Array<{
      claimId: string;
      text: string;
      sources: Array<
        | { type: "fact"; factId: string }
        | { type: "jd"; fieldId: string }
      >;
    }>;
  };
  normalizeRewriteModel(
    value: unknown,
    application: Record<string, unknown>,
  ): {
    body: string;
    evidence: Array<{ claimId: string; text: string; sources: unknown[] }>;
    factSnapshot: Array<{ factId: string; sourceType: string; text: string }>;
  };
  persistGreetingMatchMode<T extends Record<string, unknown>>(
    application: T,
    selection: { matchMode?: unknown },
  ): T & { matchMode: "strong" | "partial" | "low" };
  rewritePrompt(
    application: Record<string, unknown>,
    mode: string,
  ): string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeGreetingPlan } = require(
  "../../cloudfunctions/worker/deploy/greeting-calibration.js",
) as {
  normalizeGreetingPlan(
    input: unknown,
    context: {
      facts: Array<{ factId: string; sourceType: string; text: string }>;
      jd: Record<string, unknown>;
      rawJdText: string;
    },
  ): Record<string, unknown> & {
    matchMode: "strong" | "partial" | "low";
    directFactIds: string[];
    transferableEvidence: Array<Record<string, unknown>>;
    supportingFactIds: string[];
    gaps: string[];
    paragraphs: string[];
  };
};

const factId = "fact_1234567890abcdef12345678";
const jdFieldId = "jd_job_title";

const productionCase = syntheticGreetingCalibrationCases.financialAiAgent;
const productionFacts: Array<{
  factId: string;
  sourceType: string;
  text: string;
}> = productionCase.facts.map((fact) => ({ ...fact }));
productionFacts.push({
  factId: "fact_unused",
  sourceType: "skill",
  text: "掌握表格整理",
});
const productionJd = buildJdSnapshot(productionCase.modelOutput);
const productionBasePlan = normalizeGreetingPlan(productionCase.modelOutput, {
  facts: productionFacts,
  jd: productionJd,
  rawJdText: productionCase.jd,
});

function productionMatchPlan(matchMode: "strong" | "partial" | "low" = "strong") {
  if (matchMode === "strong") {
    return structuredClone(productionBasePlan);
  }
  return {
    matchMode,
    directFactIds: [],
    transferableEvidence:
      matchMode === "partial"
        ? productionBasePlan.directFactIds.map((id) => ({
            factId: id,
            capability: "可迁移的评测与产品能力",
            wordingStrength: "transferable",
          }))
        : [],
    supportingFactIds:
      matchMode === "low"
        ? [...productionBasePlan.directFactIds]
        : [...productionBasePlan.supportingFactIds],
    gaps:
      ["目前没有完整负责过金融AI Agent产品工作"],
  };
}

function productionNaturalDraft(): string {
  const paragraphs = productionBasePlan.paragraphs.slice(0, 3);
  paragraphs.push(
    "我参与过五千余条合成对话Case的质量复核、模型评测、失败归因和Prompt A/B Test。",
  );
  while (countVisibleCharacters(paragraphs.join("\n")) < 360) {
    paragraphs[3] += "我参与五千余条合成对话Case的质量复核和模型评测。";
  }
  return paragraphs.join("\n");
}

function validDraft() {
  const claimText = "我在课程项目中使用SQL完成3次数据分析";
  const first = `您好，我关注到贵司正在招聘产品实习生。${claimText}，能够把需求拆解为清晰任务并按计划推进。`;
  let second = "在具体推进中，我会先理解用户问题，再把信息整理成可以验证的方案，并根据反馈调整优先级。";
  let third = "我重视真实沟通，也会主动复盘结果，希望把学习能力转化为稳定交付。";
  while (countVisibleCharacters(`${first}\n${second}\n${third}`) < 360) {
    third += "我愿意从基础工作做起，及时同步进展，并认真吸收团队反馈。";
  }

  return {
    body: `${first}\n${second}\n${third}`,
    claims: [
      {
        claimId: "claim_project_match",
        text: claimText,
        sources: [
          { type: "fact" as const, factId },
          { type: "jd" as const, fieldId: jdFieldId },
        ],
      },
    ],
    omittedRequirements: [],
    warnings: [],
  };
}

function draftAtBoundary(target: number, paragraphCount: number) {
  const draft = validDraft();
  const paragraphs = [
    `您好，我关注贵司的产品实习生岗位。${draft.claims[0]!.text}。`,
    ...Array.from(
      { length: paragraphCount - 1 },
      () => "我会先理解问题，再整理证据、验证方案并根据真实反馈继续调整。",
    ),
  ];
  const body = paragraphs.join("\n");
  const shortfall = target - countVisibleCharacters(body);

  if (shortfall < 0) {
    throw new Error("Base text exceeds target visible-character count");
  }

  paragraphs[paragraphs.length - 1] += "补".repeat(shortfall);
  return { ...draft, body: paragraphs.join("\n") };
}

function draftContaining(sentence: string) {
  const draft = validDraft();
  const paragraphs = [
    `您好，我关注贵司的产品实习生岗位。${draft.claims[0]!.text}。${sentence}。`,
    "我会先理解真实问题，再整理可以核对的证据，并根据反馈判断方案是否需要调整。",
    "我重视事实边界和清晰沟通，也会记录判断依据、验证结果和下一步行动。",
  ];
  while (countVisibleCharacters(paragraphs.join("\n")) < 360) {
    paragraphs[2] += "我会继续基于真实结果复盘，而不是使用空泛结论。";
  }
  return { ...draft, body: paragraphs.join("\n") };
}

function productionRewriteApplication(matchMode?: "strong" | "partial" | "low") {
  const evidencePlan = productionMatchPlan("strong");
  const storedPlan = matchMode === undefined ? undefined : productionMatchPlan(matchMode);
  const body = productionNaturalDraft();
  const packageResult = modelGreetingPackage(
    { ...evidencePlan, paragraphs: body.split("\n") },
    productionJd,
    buildFactMatches(evidencePlan, productionJd, productionFacts),
    productionFacts,
  );
  return {
    greetingBody: body,
    factSnapshot: structuredClone(productionFacts),
    evidence: structuredClone(packageResult.evidence),
    jdSnapshot: structuredClone(productionJd),
    ...(storedPlan === undefined
      ? {}
      : { matchMode, matchPlan: structuredClone(storedPlan) }),
  };
}

function productionRewriteValue(
  application: ReturnType<typeof productionRewriteApplication>,
  body = productionNaturalDraft(),
) {
  const plan = application.matchPlan ?? productionMatchPlan("low");
  const packageResult = modelGreetingPackage(
    { ...plan, paragraphs: body.split("\n") },
    application.jdSnapshot,
    buildFactMatches(plan, application.jdSnapshot, application.factSnapshot),
    application.factSnapshot,
  );
  return {
    matchMode: plan.matchMode,
    paragraphs: body.split("\n"),
    claims: structuredClone(packageResult.evidence),
  };
}

function partialProductionContext() {
  const calibrationCase = syntheticGreetingCalibrationCases.seo;
  const facts = calibrationCase.facts.map((fact) => ({ ...fact }));
  const jd = buildJdSnapshot(calibrationCase.modelOutput);
  const plan = normalizeGreetingPlan(calibrationCase.modelOutput, {
    facts,
    jd,
    rawJdText: calibrationCase.jd,
  });
  const initial = modelGreetingPackage(
    plan,
    jd,
    buildFactMatches(plan, jd, facts),
    facts,
  );
  const application = {
    greetingBody: initial.body,
    factSnapshot: structuredClone(facts),
    evidence: structuredClone(initial.evidence),
    jdSnapshot: structuredClone(jd),
    matchMode: "partial" as const,
    matchPlan: structuredClone(plan),
  };
  return {
    application,
    valid: {
      matchMode: "partial" as const,
      paragraphs: [...plan.paragraphs],
      claims: structuredClone(initial.evidence),
    },
  };
}

type StoredDocument = Record<string, unknown>;

type ProductionUpdateOutcome =
  | "apply"
  | "zero"
  | "reject"
  | "commit_then_throw";

function productionCollection(
  documents: StoredDocument[],
  updateOutcome: (
    update: StoredDocument,
    query: StoredDocument,
  ) => ProductionUpdateOutcome = () => "apply",
  afterUpdate: (
    documents: StoredDocument[],
    update: StoredDocument,
    query: StoredDocument,
  ) => void = () => undefined,
) {
  const matches = (document: StoredDocument, query: StoredDocument) =>
    Object.entries(query).every(([key, value]) =>
      value && typeof value === "object"
        ? JSON.stringify(document[key]) === JSON.stringify(value)
        : document[key] === value,
    );
  return {
    where(query: StoredDocument) {
      const selected = () => documents.filter((document) => matches(document, query));
      return {
        limit() {
          return {
            async get() {
              return { data: selected().map((document) => structuredClone(document)) };
            },
          };
        },
        async update(update: StoredDocument) {
          const outcome = updateOutcome(update, query);
          if (outcome === "zero") return { updated: 0 };
          if (outcome === "reject") throw new Error("SIMULATED_DATABASE_REJECTION");
          const targets = selected();
          targets.forEach((document) => Object.assign(document, structuredClone(update)));
          afterUpdate(targets, update, query);
          if (outcome === "commit_then_throw") {
            throw new Error("SIMULATED_POST_COMMIT_FAILURE");
          }
          return { updated: targets.length };
        },
      };
    },
  };
}

function rewriteApplicationCore(application: StoredDocument) {
  return structuredClone({
    greetingBody: application.greetingBody,
    evidence: application.evidence,
    factSnapshot: application.factSnapshot,
  });
}

function atomicRewriteHarness({
  finalTransitionOutcomes = [],
  rollbackOutcomes = [],
  concurrentManualEdit = false,
}: {
  finalTransitionOutcomes?: ProductionUpdateOutcome[];
  rollbackOutcomes?: ProductionUpdateOutcome[];
  concurrentManualEdit?: boolean;
} = {}) {
  const timestamp = "2026-08-16T15:00:00.000Z";
  const jobId = `job_generation_${"a".repeat(24)}`;
  const userId = "user_rewrite_atomic";
  const applicationId = "application_rewrite_atomic";
  const original = productionRewriteApplication("strong");
  const applications: StoredDocument[] = [{
    _id: applicationId,
    recordType: "application",
    applicationId,
    userId,
    ...structuredClone(original),
    generationDisclosure: { mode: "real", promptVersion: "previous" },
    updatedAt: timestamp,
  }];
  const jobs: StoredDocument[] = [{
    _id: jobId,
    recordType: "ai_job",
    jobId,
    userId,
    kind: "greeting_rewrite",
    input: { applicationId, mode: "rephrase" },
    status: "queued",
    statusHistory: [{ status: "queued", enteredAt: timestamp }],
    claimState: "available",
    claimedBy: null,
    claimedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  const pendingFinalOutcomes = [...finalTransitionOutcomes];
  const pendingRollbackOutcomes = [...rollbackOutcomes];
  let expectedConcurrentApplication: StoredDocument | null = null;
  let manualEditApplied = false;
  const applicationCollection = productionCollection(
    applications,
    (update) => {
      const generationDisclosure = update.generationDisclosure as
        | { promptVersion?: string }
        | undefined;
      return generationDisclosure?.promptVersion === "previous"
        ? (pendingRollbackOutcomes.shift() ?? "apply")
        : "apply";
    },
    (targets, update) => {
      const generationDisclosure = update.generationDisclosure as
        | { promptVersion?: string }
        | undefined;
      if (
        concurrentManualEdit &&
        !manualEditApplied &&
        generationDisclosure?.promptVersion !== "previous"
      ) {
        manualEditApplied = true;
        for (const document of targets) {
          Object.assign(document, {
            greetingBody: "用户在改写完成后手动修改的正文。",
            updatedAt: "2026-08-16T15:00:01.000Z",
          });
          expectedConcurrentApplication = structuredClone(document);
        }
      }
    },
  );
  const jobCollection = productionCollection(jobs, (update) =>
    update.status === "succeeded"
      ? (pendingFinalOutcomes.shift() ?? "apply")
      : "apply"
  );
  const rewrittenBody = productionNaturalDraft().replace(
    "希望进一步了解",
    "期待进一步了解",
  );
  const modelValue = productionRewriteValue(original, rewrittenBody);
  const database = {
    collection(name: string) {
      if (name === "applications") return applicationCollection;
      if (name === "ai_jobs") return jobCollection;
      return productionCollection([]);
    },
  };
  const worker = createExperienceWorker({
    app: {},
    database,
    credentials: {},
    now: () => new Date(timestamp),
    modelCall: async () => structuredClone(modelValue),
  });

  return {
    applications,
    before: rewriteApplicationCore(applications[0]!),
    jobId,
    jobs,
    rewrittenBody,
    get expectedConcurrentApplication() {
      return expectedConcurrentApplication;
    },
    worker,
  };
}

const registry = {
  factIds: new Set([factId]),
  jdFieldIds: new Set([jdFieldId]),
};

describe("AI greeting quality gate", () => {
  it("accepts a compliant simplified-Chinese draft", () => {
    const draft = validDraft();

    expect(countVisibleCharacters(draft.body)).toBeGreaterThanOrEqual(300);
    expect(countVisibleCharacters(draft.body)).toBeLessThanOrEqual(450);
    expect(validateAiGreeting(draft, registry)).toEqual({ valid: true, errors: [] });
  });

  it("accepts a 350-character greeting with four paragraphs", () => {
    const draft = draftAtBoundary(350, 4);

    expect(countVisibleCharacters(draft.body)).toBe(350);
    expect(validateAiGreeting(draft, registry)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a 349-character greeting", () => {
    const draft = draftAtBoundary(349, 4);

    expect(validateAiGreeting(draft, registry).errors).toContain(
      "BODY_LENGTH_INVALID",
    );
  });

  it("rejects five paragraphs even at the 350-character boundary", () => {
    const draft = draftAtBoundary(350, 5);

    expect(validateAiGreeting(draft, registry).errors).toContain(
      "BODY_PARAGRAPH_COUNT_INVALID",
    );
  });

  it("rejects short and long bodies", () => {
    expect(
      validateAiGreeting({ ...validDraft(), body: "您好\n谢谢" }, registry).errors,
    ).toContain("BODY_LENGTH_INVALID");
    expect(
      validateAiGreeting(
        {
          ...validDraft(),
          body: `${"字".repeat(226)}\n${"字".repeat(225)}`,
        },
        registry,
      ).errors,
    ).toContain("BODY_LENGTH_INVALID");
  });

  it("rejects mechanical JD-copy fallback phrases", () => {
    const draft = validDraft();
    const body = draft.body.replace(
      "您好，我关注到贵司正在招聘产品实习生。",
      "您好，看到岗位主要围绕需求分析展开，这些要求与我的经历和能力比较契合。",
    );

    expect(validateAiGreeting({ ...draft, body }, registry).errors).toContain(
      "MECHANICAL_TEMPLATE_PRESENT",
    );
  });

  it.each([
    "希望贴近真实工作",
    "希望 贴近\n真实工作",
    "希望能贴近真实工作",
    "希望进一步贴近真实工作",
    "希望用已有分析练习贴近真实工作",
    "希望用已有分析尝试\n贴近真实工作",
    "这些练习让我对岗位产生兴趣",
    "愿意踏实学习岗位要求",
    "愿意在岗位中踏实学习",
    "虽然我没有直接经验，但是我会努力",
    "我缺少相关经验",
    "我暂时没有对口经历",
    "我的经历与岗位不完全匹配",
    "希望弥补不足",
    "学习能力强",
  ])("rejects self-downgrading language: %s", (sentence) => {
    const draft = draftContaining(sentence);

    expect(containsMechanicalGreetingPhrase(draft.body)).toBe(true);
    expect(containsProductionMechanicalGreetingPhrase(draft.body)).toBe(true);
    expect(validateAiGreeting(draft, registry).errors).toContain(
      "MECHANICAL_TEMPLATE_PRESENT",
    );
  });

  it.each([
    "课程包含财务分析练习题",
    "不会把完整投资项目弱化为分析练习",
  ])("does not flag factual or negated analysis-practice context: %s", (sentence) => {
    expect(containsMechanicalGreetingPhrase(sentence)).toBe(false);
    expect(containsProductionMechanicalGreetingPhrase(sentence)).toBe(false);
  });

  it("executes the production rewrite normalizer with v8 boundaries", () => {
    const application = productionRewriteApplication("strong");
    const compliant = productionRewriteValue(application);

    expect(normalizeRewriteModel(compliant, application)).toMatchObject({
      body: productionNaturalDraft(),
      evidence: expect.arrayContaining([
        expect.objectContaining({ claimId: "claim_match_1" }),
      ]),
    });
    expect(() =>
      normalizeRewriteModel(
        { ...compliant, paragraphs: draftAtBoundary(349, 4).body.split("\n") },
        application,
      ),
    ).toThrow("GREETING_LENGTH_INVALID");
    expect(() =>
      normalizeRewriteModel(
        { ...compliant, paragraphs: draftAtBoundary(350, 5).body.split("\n") },
        application,
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
    expect(() =>
      normalizeRewriteModel(
        {
          ...compliant,
          paragraphs: productionNaturalDraft()
            .replace(/^您好，/u, "你好，")
            .split("\n"),
        },
        application,
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
  });

  it("rejects a valid-shape production rewrite that invents experience and a certificate", () => {
    const application = productionRewriteApplication("strong");
    const value = productionRewriteValue(application);
    const invented = structuredClone(value);
    invented.paragraphs[1] = `我曾在星河集团担任高级工程师，并获得云架构师证书。${invented.paragraphs[1]}`;
    invented.claims[1]!.text = invented.paragraphs[1]!;

    expect(countVisibleCharacters(invented.paragraphs.join("\n"))).toBeLessThanOrEqual(
      450,
    );
    expect(() => normalizeRewriteModel(invented, application)).toThrow(
      "MODEL_INVALID_OUTPUT",
    );
  });

  it("replaces stale evidence and keeps only newly cited fact snapshots", () => {
    const application = productionRewriteApplication("strong");
    application.evidence.push({
      claimId: "claim_stale_unused",
      text: "掌握表格整理",
      sources: [{ type: "fact", factId: "fact_unused" }],
    });

    const normalized = normalizeRewriteModel(
      productionRewriteValue(application),
      application,
    );

    expect(normalized.evidence.map(({ claimId }) => claimId)).not.toContain(
      "claim_stale_unused",
    );
    expect(normalized.factSnapshot.map(({ factId: id }) => id)).toEqual([
      "fact_eval",
      "fact_product",
      "fact_fintech",
    ]);
  });

  it("rejects rewrite claim sources outside the current application source set", () => {
    const application = productionRewriteApplication("strong");
    const value = productionRewriteValue(application);
    value.claims[0]!.sources = [
      { type: "fact", factId: "fact_not_in_application" },
    ];

    expect(() => normalizeRewriteModel(value, application)).toThrow(
      "MODEL_INVALID_OUTPUT",
    );
  });

  it("does not mutate the stored application when production rewrite validation fails", () => {
    const application = productionRewriteApplication("strong");
    const before = structuredClone(application);
    const value = productionRewriteValue(application);
    value.claims[0]!.sources = [];

    expect(() => normalizeRewriteModel(value, application)).toThrow(
      "MODEL_INVALID_OUTPUT",
    );
    expect(application).toEqual(before);
  });

  it("accepts a partial rewrite that keeps gaps internal", () => {
    const { application } = partialProductionContext();
    const jd = application.jdSnapshot as {
      jobTitle: { fieldId: string };
      companyName: { fieldId: string };
      hardSkills: [{ fieldId: string }, { fieldId: string }];
    };
    const paragraphs = [
      "您好，我希望应聘远航网络的SEO经理。我有实际的网站页面搭建和部署、SQL数据分析与A/B Test验证经历。",
      "我独立完成过Web产品的页面搭建、测试、修复和部署，但不会把这段经历表述成Technical SEO经验。",
      "我也会使用SQL、表格和可视化工具分析数据，并在业务项目中根据指标定位问题、调整方案，再通过A/B Test验证结果。",
      "此外，我能够检索和阅读英文资料。希望有机会进一步沟通。",
    ];
    while (countVisibleCharacters(paragraphs.join("\n")) < 360) {
      paragraphs[3] += "我能够检索和阅读英文资料。";
    }
    const value = {
      matchMode: "partial",
      paragraphs,
      claims: [
        {
          claimId: "claim_match_1",
          text: paragraphs[0],
          sources: [
            { type: "jd", fieldId: jd.jobTitle.fieldId },
            { type: "jd", fieldId: jd.companyName.fieldId },
            { type: "fact", factId: "fact_web" },
            { type: "jd", fieldId: jd.hardSkills[0].fieldId },
          ],
        },
        {
          claimId: "claim_match_2",
          text: paragraphs[1],
          sources: [
            { type: "fact", factId: "fact_web" },
            { type: "jd", fieldId: jd.hardSkills[0].fieldId },
          ],
        },
        {
          claimId: "claim_match_3",
          text: paragraphs[2],
          sources: [
            { type: "fact", factId: "fact_data" },
            { type: "jd", fieldId: jd.hardSkills[0].fieldId },
            { type: "fact", factId: "fact_iteration" },
            { type: "jd", fieldId: jd.hardSkills[1].fieldId },
          ],
        },
        {
          claimId: "claim_match_4",
          text: paragraphs[3],
          sources: [
            { type: "fact", factId: "fact_english" },
            { type: "jd", fieldId: jd.hardSkills[0].fieldId },
          ],
        },
      ],
    };

    expect(() => normalizeRewriteModel(value, application)).not.toThrow();
  });

  it("rejects a partial rewrite whose gap is present but cites no transferable fact", () => {
    const { application } = partialProductionContext();
    const jd = application.jdSnapshot as {
      jobTitle: { fieldId: string };
      companyName: { fieldId: string };
      hardSkills: [{ fieldId: string }, { fieldId: string }];
    };
    const repeatedFact = "我具有英文资料检索和阅读能力。";
    const paragraphs = [
      `您好，我希望应聘远航网络的SEO经理。我没有完整负责过SEO项目和关键词研究。${repeatedFact.repeat(4)}`,
      repeatedFact.repeat(6),
      `${repeatedFact.repeat(6)}期待有机会进一步沟通。`,
    ];
    while (countVisibleCharacters(paragraphs.join("\n")) < 360) {
      paragraphs[2] += repeatedFact;
    }
    const value = {
      matchMode: "partial",
      paragraphs,
      claims: paragraphs.map((text, index) => ({
        claimId: `claim_match_${index + 1}`,
        text,
        sources: [
          ...(index === 0
            ? [
                { type: "jd", fieldId: jd.jobTitle.fieldId },
                { type: "jd", fieldId: jd.companyName.fieldId },
              ]
            : []),
          { type: "fact", factId: "fact_english" },
          { type: "jd", fieldId: jd.hardSkills[0].fieldId },
        ],
      })),
    };

    expect(() => normalizeRewriteModel(value, application)).toThrow(
      "MODEL_INVALID_OUTPUT",
    );
  });

  it("accepts a partial rewrite with its stored gap and transferable fact evidence", () => {
    const { application, valid } = partialProductionContext();

    expect(normalizeRewriteModel(valid, application)).toMatchObject({
      body: application.greetingBody,
      evidence: expect.arrayContaining([
        expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({ type: "fact", factId: "fact_web" }),
          ]),
        }),
      ]),
    });
  });

  it("rolls back the application and fails the job when final rewrite transition fails", async () => {
    const scenario = atomicRewriteHarness({ finalTransitionOutcomes: ["zero"] });

    await expect(scenario.worker({ jobId: scenario.jobId })).resolves.toMatchObject({
      ok: false,
    });
    expect(rewriteApplicationCore(scenario.applications[0]!)).toEqual(
      scenario.before,
    );
    expect(scenario.jobs[0]?.status).toBe("failed");
  });

  it("keeps the rewritten application when final transition committed before throwing", async () => {
    const scenario = atomicRewriteHarness({
      finalTransitionOutcomes: ["commit_then_throw"],
    });

    await expect(scenario.worker({ jobId: scenario.jobId })).resolves.toMatchObject({
      ok: true,
      data: { status: "succeeded" },
    });
    expect(scenario.jobs[0]?.status).toBe("succeeded");
    expect(scenario.applications[0]?.greetingBody).toBe(scenario.rewrittenBody);
    expect(rewriteApplicationCore(scenario.applications[0]!)).not.toEqual(
      scenario.before,
    );
  });

  it("retries a rejected rollback and finishes with failed job plus original application", async () => {
    const scenario = atomicRewriteHarness({
      finalTransitionOutcomes: ["zero"],
      rollbackOutcomes: ["reject", "apply"],
    });

    await expect(scenario.worker({ jobId: scenario.jobId })).resolves.toMatchObject({
      ok: false,
    });
    expect(scenario.jobs[0]?.status).toBe("failed");
    expect(rewriteApplicationCore(scenario.applications[0]!)).toEqual(
      scenario.before,
    );
  });

  it("retries a zero-match rollback and finishes with failed job plus original application", async () => {
    const scenario = atomicRewriteHarness({
      finalTransitionOutcomes: ["zero"],
      rollbackOutcomes: ["zero", "apply"],
    });

    await expect(scenario.worker({ jobId: scenario.jobId })).resolves.toMatchObject({
      ok: false,
    });
    expect(scenario.jobs[0]?.status).toBe("failed");
    expect(rewriteApplicationCore(scenario.applications[0]!)).toEqual(
      scenario.before,
    );
  });

  it("preserves a concurrent manual edit when final transition fails", async () => {
    const scenario = atomicRewriteHarness({
      finalTransitionOutcomes: ["zero"],
      concurrentManualEdit: true,
    });

    await expect(scenario.worker({ jobId: scenario.jobId })).resolves.toMatchObject({
      ok: true,
      data: { status: "succeeded" },
    });
    expect(scenario.jobs[0]?.status).toBe("succeeded");
    expect(scenario.expectedConcurrentApplication).not.toBeNull();
    expect(scenario.applications[0]).toEqual(
      scenario.expectedConcurrentApplication,
    );
  });

  it("persists partial match mode and sends its actual wording strength to production rewrite", () => {
    const partial = persistGreetingMatchMode(
      productionRewriteApplication(),
      productionMatchPlan("partial"),
    );
    const strong = persistGreetingMatchMode(
      productionRewriteApplication(),
      productionMatchPlan("strong"),
    );
    const partialPrompt = rewritePrompt(partial, "rephrase");
    const strongPrompt = rewritePrompt(strong, "rephrase");
    const legacyPrompt = rewritePrompt(productionRewriteApplication(), "rephrase");

    expect(partial.matchMode).toBe("partial");
    expect(partial.matchPlan).toEqual(productionMatchPlan("partial"));
    expect(partialPrompt).toContain("当前 matchMode：partial");
    expect(partialPrompt).toContain("transferable");
    expect(partialPrompt).toContain("claim_match_1");
    expect(partialPrompt).toContain('"claims"');
    expect(partialPrompt).toContain('"sources"');
    expect(strongPrompt).toContain("当前 matchMode：strong");
    expect(strongPrompt).toContain("direct");
    expect(strongPrompt).not.toBe(partialPrompt);
    expect(legacyPrompt).toContain("当前 matchMode：low");
    expect(legacyPrompt).toContain("foundation");
  });

  it("preserves a genuine stored low match plan instead of synthesizing legacy fallback", () => {
    const lowPlan = productionMatchPlan("low");
    const low = persistGreetingMatchMode(
      productionRewriteApplication(),
      lowPlan,
    );

    const prompt = rewritePrompt(low, "rephrase");

    expect(prompt).toContain("当前 matchMode：low");
    expect(prompt).toContain(JSON.stringify(lowPlan.gaps[0]));
    for (const factId of lowPlan.supportingFactIds) {
      expect(prompt).toContain(factId);
    }
    expect(prompt).not.toContain("没有可验证的直接岗位经验");
  });

  it.each([
    [
      "mismatched mode",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        application.matchMode = "strong";
        (application as Record<string, unknown>).matchPlan =
          productionMatchPlan("partial");
      },
    ],
    [
      "missing selected facts",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        (application as Record<string, unknown>).matchPlan = {
          ...productionMatchPlan("strong"),
          directFactIds: ["fact_missing_from_snapshot"],
        };
      },
    ],
    [
      "stale evidence plan",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        const selected = productionMatchPlan("strong").directFactIds[0]!;
        application.evidence = application.evidence.map((claim) => ({
          ...claim,
          sources: claim.sources.filter(
            (source) => source.type !== "fact" || source.factId !== selected,
          ),
        }));
      },
    ],
    [
      "unknown raw mode",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        (application.matchPlan as unknown as Record<string, unknown>).matchMode =
          "bogus";
      },
    ],
    [
      "malformed required array",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        (application.matchPlan as unknown as Record<string, unknown>).directFactIds =
          "fact_eval";
      },
    ],
    [
      "malformed transferable evidence",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        (application.matchPlan as unknown as Record<string, unknown>)
          .transferableEvidence = [{
            factId: "fact_eval",
            capability: 42,
            wordingStrength: "expert",
          }];
      },
    ],
    [
      "malformed gap entries",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        (application.matchPlan as unknown as Record<string, unknown>).gaps = [42];
      },
    ],
    [
      "strong mode without direct evidence",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        const plan = application.matchPlan as unknown as Record<string, unknown>;
        const direct = [...(plan.directFactIds as string[])];
        plan.directFactIds = [];
        plan.supportingFactIds = [
          ...direct,
          ...(plan.supportingFactIds as string[]),
        ];
      },
    ],
    [
      "partial mode without transferable evidence",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        application.matchMode = "partial";
        (application as Record<string, unknown>).matchPlan = {
          ...productionMatchPlan("partial"),
          transferableEvidence: [],
        };
      },
    ],
    [
      "partial mode without an explicit gap",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        application.matchMode = "partial";
        (application as Record<string, unknown>).matchPlan = {
          ...productionMatchPlan("partial"),
          gaps: [],
        };
      },
    ],
    [
      "low mode containing direct evidence",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        application.matchMode = "low";
        const low = productionMatchPlan("low");
        (application as Record<string, unknown>).matchPlan = {
          ...low,
          directFactIds: [low.supportingFactIds[0]],
          supportingFactIds: low.supportingFactIds.slice(1),
        };
      },
    ],
    [
      "low mode without supporting evidence or a gap",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        application.matchMode = "low";
        (application as Record<string, unknown>).matchPlan = {
          ...productionMatchPlan("low"),
          supportingFactIds: [],
          gaps: [],
        };
      },
    ],
    [
      "same fact reused across evidence tiers",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        const plan = application.matchPlan as unknown as Record<string, unknown>;
        plan.supportingFactIds = [
          (plan.directFactIds as string[])[0],
        ];
      },
    ],
    [
      "oversized evidence arrays",
      (application: ReturnType<typeof productionRewriteApplication>) => {
        (application.matchPlan as unknown as Record<string, unknown>).directFactIds =
          Array.from({ length: 5 }, (_, index) => `fact_oversized_${index}`);
      },
    ],
  ])("fails closed for a persisted invalid match plan: %s", (_label, mutate) => {
    const application = productionRewriteApplication("strong");
    mutate(application);

    expect(() => rewritePrompt(application, "rephrase")).toThrow(
      "MODEL_INVALID_OUTPUT",
    );
  });

  it("uses conservative legacy fallback only when matchPlan is absent", () => {
    const legacy = productionRewriteApplication();

    expect(legacy).not.toHaveProperty("matchPlan");
    expect(rewritePrompt(legacy, "rephrase")).toContain(
      "没有可验证的直接岗位经验",
    );
  });

  it.each(["strong", "partial", "low"] as const)(
    "accepts a valid persisted %s match plan",
    (mode) => {
      expect(() =>
        rewritePrompt(productionRewriteApplication(mode), "rephrase"),
      ).not.toThrow();
    },
  );

  it("rejects an invalid paragraph count", () => {
    const draft = validDraft();

    expect(
      validateAiGreeting({ ...draft, body: draft.body.replace("\n", " ") }, registry)
        .errors,
    ).toContain("BODY_PARAGRAPH_COUNT_INVALID");
  });

  it("rejects known Traditional Chinese in the main body", () => {
    const draft = validDraft();

    expect(
      validateAiGreeting({ ...draft, body: `${draft.body}臺` }, registry).errors,
    ).toContain("BODY_NOT_SIMPLIFIED_CHINESE");
  });

  it("rejects numbers that are not covered by a sourced claim", () => {
    const draft = validDraft();

    expect(
      validateAiGreeting({ ...draft, body: `${draft.body}可于2025年到岗。` }, registry)
        .errors,
    ).toContain("UNSOURCED_NUMBER");
  });

  it("rejects contact details", () => {
    const draft = validDraft();

    expect(
      validateAiGreeting({ ...draft, body: `${draft.body}电话13800138000。` }, registry)
        .errors,
    ).toContain("SENSITIVE_INFORMATION_PRESENT");
  });

  it("rejects invalid Unicode from model output", () => {
    const draft = validDraft();

    expect(
      validateAiGreeting({ ...draft, body: `${draft.body}\uD800` }, registry).errors,
    ).toContain("INVALID_UNICODE");
  });
});
