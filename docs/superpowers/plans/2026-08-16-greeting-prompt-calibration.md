# Greeting Prompt Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ApplyMate 开场白升级为一次模型调用完成的“岗位理解 → 证据分层 → 350–450 字正文”流程，稳定区分强匹配、部分匹配和低匹配，并阻止跨 JD 串台、经历降级和可迁移能力冒充直接经验。

**Architecture:** TokenHub 仍只调用一次，模型返回紧凑的岗位与证据计划以及 3–4 段正文。共享 TypeScript Schema 定义产品契约；生产 `worker` 使用无依赖 CommonJS 校准器执行同构验证，再沿用现有事实与 JD 证据系统生成逐段证据。任何计划、事实来源、措辞强度、长度或岗位语义失败都会释放额度，不增加第二次模型调用或本地兜底文案。

**Tech Stack:** TypeScript 7、Zod 4、Node.js 20 CommonJS、Vitest 4、腾讯 CloudBase 云函数、TokenHub Hy3、微信原生小程序。

---

## File Map and Change Boundaries

- Create `shared/src/greeting-match-plan.ts`: 唯一的 TypeScript 匹配计划 Schema、类型和事实 ID 汇总函数。
- Create `cloudfunctions/worker/deploy/greeting-calibration.js`: 生产部署目录中的无依赖计划校验、领域词来源校验和措辞强度校验。
- Create `tests/helpers/synthetic-greeting-calibration-cases.ts`: 三组完全合成、脱敏的投资、金融 AI Agent、SEO 回归输入。
- Create `tests/unit/greeting-match-plan.test.ts`: 共享 Schema 边界测试。
- Create `tests/unit/greeting-calibration.test.ts`: 生产 CommonJS 校准器测试。
- Create `tests/model-evaluation/greeting-calibration-gold-cases.test.ts`: 三种匹配模式和主要 Bad Case 的离线金标准测试。
- Modify `shared/src/index.ts`, `shared/src/limits.ts`, `shared/src/greeting.ts`: 导出新契约并统一 350–450 字、3–4 段质量门。
- Modify `cloudfunctions/worker/deploy/experience-worker.js`: 修正岗位路由、替换 Prompt 输出结构、接入校准器并更新 v8 披露。
- Modify `cloudfunctions/worker/src/greeting-generation-pipeline.ts` and `cloudfunctions/worker/src/greeting-rewrite-pipeline.ts`: 保持源码层 Prompt 和生产部署层规则一致。
- Modify `tests/unit/experience-worker-privacy.test.ts`, `tests/unit/greeting-quality.test.ts`, `tests/integration/experience-real-ai-regression.test.ts`, `tests/contract/greeting-rewrite-pipeline.test.ts`: 删除 v7 固定首尾和恰好三段假设，锁定 v8 契约。
- Modify `docs/phase-10/greeting-quality-calibration.md`, `docs/phase-10/experience-version-upload-guide.md` and all five `memory-bank/*.md` files: 同步产品规则、架构、实施状态与人工验收门。

### Repository Safety Rules

- 当前工作树已有大量用户改动。每次提交只使用本计划列出的精确路径，禁止 `git add .`、`git add -A`、`git commit -a`。
- 不暂存或提交 `project.config.json`、`project.private.config.json`、任何 `.env*`、真实简历、真实 JD、真实开场白、OpenID、Secret、Token 或云端导出。
- 每项任务开始前运行 `git status --short`；若目标文件含有既有改动，先阅读当前内容，在现有状态上做最小补丁，不回退用户修改。
- Task 1–8 只做本地代码、测试和文档。Task 9 在产品负责人另行授权前不得调用 TokenHub、部署 worker 或修改 CloudBase。

### Task 1: Define the Shared Match-Plan Contract

**Files:**
- Create: `shared/src/greeting-match-plan.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/limits.ts`
- Create: `tests/unit/greeting-match-plan.test.ts`
- Modify: `tests/unit/greeting-quality.test.ts`

- [ ] **Step 1: Write the failing match-plan and boundary tests**

Create `tests/unit/greeting-match-plan.test.ts` with the exact contract expectations:

```ts
import { describe, expect, it } from "vitest";

import {
  GreetingMatchPlanSchema,
  collectGreetingFactIds,
} from "../../shared/src/greeting-match-plan.js";

const validPlan = {
  jobTitle: "模型评测产品实习生",
  companyName: "示例科技",
  coreFunctions: [
    { requirementType: "responsibilities", requirementIndex: 0, summary: "模型效果评测" },
    { requirementType: "responsibilities", requirementIndex: 1, summary: "Badcase 归因" },
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
    "您好，我是南方理工大学金融科技专业在读学生。",
    "我参与过真实对话数据评测和高频失败 Case 归因。",
    "我也独立完成过生成式 AI 产品的需求拆解和迭代。",
  ],
} as const;

describe("GreetingMatchPlanSchema", () => {
  it("accepts a strong plan and returns unique fact ids in evidence order", () => {
    expect(GreetingMatchPlanSchema.parse(validPlan).matchMode).toBe("strong");
    expect(collectGreetingFactIds(validPlan)).toEqual([
      "fact_dialogue_eval",
      "fact_product_project",
      "fact_fintech_education",
    ]);
  });

  it("requires a direct fact for strong mode", () => {
    expect(() =>
      GreetingMatchPlanSchema.parse({ ...validPlan, directFactIds: [] }),
    ).toThrow();
  });

  it("requires a gap and transferable evidence for partial mode", () => {
    expect(() =>
      GreetingMatchPlanSchema.parse({
        ...validPlan,
        matchMode: "partial",
        directFactIds: [],
        transferableEvidence: [],
        gaps: [],
      }),
    ).toThrow();
  });

  it("rejects duplicate fact ids across evidence tiers", () => {
    expect(() =>
      GreetingMatchPlanSchema.parse({
        ...validPlan,
        supportingFactIds: ["fact_dialogue_eval"],
      }),
    ).toThrow();
  });

  it("requires an explicit gap and background evidence for low mode", () => {
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        matchMode: "low",
        directFactIds: [],
        transferableEvidence: [],
        supportingFactIds: ["fact_fintech_education"],
        gaps: ["缺少模型评测直接经历"],
      }).success,
    ).toBe(true);
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

  it("accepts three or four paragraphs and rejects other counts", () => {
    expect(GreetingMatchPlanSchema.safeParse(validPlan).success).toBe(true);
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        paragraphs: [...validPlan.paragraphs, "补充真实的到岗条件。"],
      }).success,
    ).toBe(true);
    expect(
      GreetingMatchPlanSchema.safeParse({
        ...validPlan,
        paragraphs: validPlan.paragraphs.slice(0, 2),
      }).success,
    ).toBe(false);
  });
});
```

Add these boundary assertions to `tests/unit/greeting-quality.test.ts`:

```ts
function draftAtBoundary(target: number, paragraphCount: number) {
  const draft = validDraft();
  const paragraphs = [
    `您好，我关注贵司的产品实习生岗位。${draft.claims[0].text}。`,
    ...Array.from(
      { length: paragraphCount - 1 },
      () => "我会先理解问题，再整理证据、验证方案并根据真实反馈继续调整。",
    ),
  ];
  const missing = target - countVisibleCharacters(paragraphs.join("\n"));
  if (missing < 0) throw new Error("Boundary fixture base text is too long.");
  paragraphs[paragraphs.length - 1] += "补".repeat(missing);
  return { ...draft, body: paragraphs.join("\n") };
}

it("accepts a sourced four-paragraph greeting at the 350-character boundary", () => {
  const draft = draftAtBoundary(350, 4);
  expect(validateAiGreeting(draft, registry)).toEqual({ valid: true, errors: [] });
});

it("rejects 349 visible characters and five paragraphs", () => {
  expect(validateAiGreeting(draftAtBoundary(349, 3), registry).errors)
    .toContain("BODY_LENGTH_INVALID");
  expect(validateAiGreeting(draftAtBoundary(350, 5), registry).errors)
    .toContain("BODY_PARAGRAPH_COUNT_INVALID");
});
```

- [ ] **Step 2: Run the focused tests and confirm the red state**

Run:

```bash
npx vitest run tests/unit/greeting-match-plan.test.ts tests/unit/greeting-quality.test.ts
```

Expected: FAIL because `shared/src/greeting-match-plan.ts` does not exist and the current paragraph maximum is three.

- [ ] **Step 3: Add the shared Schema and new boundaries**

Create `shared/src/greeting-match-plan.ts`:

```ts
import { z } from "zod";

export const GREETING_MATCH_PLAN_KEYS = [
  "jobTitle",
  "companyName",
  "coreFunctions",
  "domainContext",
  "matchMode",
  "directFactIds",
  "transferableEvidence",
  "supportingFactIds",
  "gaps",
  "paragraphs",
] as const;

const FactIdSchema = z.string().trim().min(1).max(128);
const RequirementTypeSchema = z.enum([
  "responsibilities",
  "hardSkills",
  "experienceEducation",
  "locationWorkMode",
  "availabilityDuration",
]);

export const MatchModeSchema = z.enum(["strong", "partial", "low"]);
export const WordingStrengthSchema = z.enum(["transferable", "foundation"]);

export const GreetingMatchPlanSchema = z
  .object({
    jobTitle: z.string().trim().min(1).max(200),
    companyName: z.string().trim().max(200),
    coreFunctions: z
      .array(
        z
          .object({
            requirementType: RequirementTypeSchema,
            requirementIndex: z.number().int().min(0).max(19),
            summary: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .min(2)
      .max(5),
    domainContext: z.array(z.string().trim().min(1).max(80)).max(4),
    matchMode: MatchModeSchema,
    directFactIds: z.array(FactIdSchema).max(4),
    transferableEvidence: z
      .array(
        z
          .object({
            factId: FactIdSchema,
            capability: z.string().trim().min(1).max(120),
            wordingStrength: WordingStrengthSchema,
          })
          .strict(),
      )
      .max(4),
    supportingFactIds: z.array(FactIdSchema).max(4),
    gaps: z.array(z.string().trim().min(1).max(160)).max(5),
    paragraphs: z.array(z.string().trim().min(1).max(2_000)).min(3).max(4),
  })
  .strict()
  .superRefine((value, context) => {
    const allFactIds = [
      ...value.directFactIds,
      ...value.transferableEvidence.map(({ factId }) => factId),
      ...value.supportingFactIds,
    ];
    if (new Set(allFactIds).size !== allFactIds.length) {
      context.addIssue({
        code: "custom",
        message: "A factId may appear in only one evidence tier.",
      });
    }
    if (value.matchMode === "strong" && value.directFactIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Strong mode requires direct evidence.",
      });
    }
    if (
      value.matchMode === "partial" &&
      (value.transferableEvidence.length === 0 || value.gaps.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Partial mode requires a gap and transferable evidence.",
      });
    }
    if (
      value.matchMode === "low" &&
      (value.directFactIds.length > 0 ||
        value.transferableEvidence.length > 0 ||
        value.supportingFactIds.length === 0 ||
        value.gaps.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Low mode requires a gap and background evidence only.",
      });
    }
  });

export type GreetingMatchPlan = z.infer<typeof GreetingMatchPlanSchema>;

export function collectGreetingFactIds(
  plan: Pick<
    GreetingMatchPlan,
    "directFactIds" | "transferableEvidence" | "supportingFactIds"
  >,
): string[] {
  return Array.from(
    new Set([
      ...plan.directFactIds,
      ...plan.transferableEvidence.map(({ factId }) => factId),
      ...plan.supportingFactIds,
    ]),
  );
}
```

Change the greeting constants in `shared/src/limits.ts` to:

```ts
export const MIN_GREETING_VISIBLE_CHARACTERS = 350;
export const MAX_GREETING_VISIBLE_CHARACTERS = 450;
export const MIN_GREETING_PARAGRAPHS = 3;
export const MAX_GREETING_PARAGRAPHS = 4;
```

Add this export to `shared/src/index.ts` immediately after `greeting.js`:

```ts
export * from "./greeting-match-plan.js";
```

- [ ] **Step 4: Run focused tests and shared type checking**

Run:

```bash
npx vitest run tests/unit/greeting-match-plan.test.ts tests/unit/greeting-quality.test.ts
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit only the shared contract files**

```bash
git add shared/src/greeting-match-plan.ts shared/src/index.ts shared/src/limits.ts tests/unit/greeting-match-plan.test.ts tests/unit/greeting-quality.test.ts
git commit -m "feat: define greeting match plan contract"
```

### Task 2: Add a Dependency-Free Production Calibration Gate

**Files:**
- Create: `cloudfunctions/worker/deploy/greeting-calibration.js`
- Create: `tests/unit/greeting-calibration.test.ts`

- [ ] **Step 1: Write failing tests for runtime contract parity and evidence maturity**

Create `tests/unit/greeting-calibration.test.ts`:

```ts
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { GREETING_MATCH_PLAN_KEYS } from "../../shared/src/greeting-match-plan.js";

const require = createRequire(import.meta.url);
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
    expect(calibration.normalizeGreetingPlan(plan, { facts, jd, rawJdText }))
      .toMatchObject(plan);
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
    expect(calibration.normalizeGreetingPlan(lowPlan, { facts, jd, rawJdText }))
      .toMatchObject(lowPlan);
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

  it("rejects direct-experience wording for transferable evidence", () => {
    expect(() =>
      calibration.assertParagraphWording(
        "我独立负责过完整 SEO 策略制定并提升自然流量。",
        "transferable",
        ["SEO", "自然流量"],
      ),
    ).toThrow("MODEL_INVALID_OUTPUT");
    expect(() =>
      calibration.assertParagraphWording(
        "网站实操和数据分析方法具备一定迁移基础。",
        "transferable",
        ["SEO", "自然流量"],
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the calibration test and confirm the missing-module failure**

Run:

```bash
npx vitest run tests/unit/greeting-calibration.test.ts
```

Expected: FAIL because `cloudfunctions/worker/deploy/greeting-calibration.js` does not exist.

- [ ] **Step 3: Implement the production calibration module**

Create `cloudfunctions/worker/deploy/greeting-calibration.js`:

```js
"use strict";

const PLAN_KEYS = Object.freeze([
  "jobTitle",
  "companyName",
  "coreFunctions",
  "domainContext",
  "matchMode",
  "directFactIds",
  "transferableEvidence",
  "supportingFactIds",
  "gaps",
  "paragraphs",
]);

const JD_LIST_KEYS = Object.freeze([
  "responsibilities",
  "hardSkills",
  "experienceEducation",
  "locationWorkMode",
  "availabilityDuration",
]);

const DOMAIN_TERMS = Object.freeze([
  "投研",
  "研报",
  "估值",
  "DCF",
  "尽职调查",
  "并购",
  "SEO",
  "SEM",
  "Google Search Console",
  "Google Analytics",
  "关键词研究",
  "自然搜索",
  "模型评测",
  "Badcase",
  "Prompt",
  "Agent",
  "RAG",
  "合规",
]);

const CONTROLLED_PROFESSIONAL_TERMS = Object.freeze([
  "Excel",
  "PPT",
  "SQL",
  "Python",
  "Power BI",
  "Figma",
  "DCF",
  "WACC",
  "CAPM",
  "Beta",
  "PE/PB",
  "P/E",
  "Google Search Console",
  "Google Analytics",
  "证券从业资格",
]);

const NAMED_ORGANIZATION_PATTERN = /[\p{Script=Han}A-Za-z0-9]{2,24}(?:大学|学院|研究院|有限公司|资本)/gu;

const DIRECT_EXPERIENCE_PATTERNS = Object.freeze([
  /(?:独立|实际)?负责过/iu,
  /(?:独立|实际)?开展过/iu,
  /(?:独立|实际)?完成过/iu,
  /(?:独立|实际)?搭建过/iu,
  /(?:独立|实际)?主导过/iu,
  /(?:拥有|具备).{0,12}(?:经验|实践)/iu,
  /(?:熟悉|熟练掌握|精通).{0,20}(?:SEO|SEM|RAG|Agent|尽职调查|并购)/iu,
]);

const NEGATED_DIRECT_PATTERN = /(?:没有|尚未|暂未|并未|不曾).{0,16}(?:负责过|开展过|完成过|搭建过|主导过|经验|熟悉|熟练掌握|精通)/iu;

function fail(gate) {
  const error = new Error("MODEL_INVALID_OUTPUT");
  error.validationGate = gate;
  throw error;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalized(value) {
  return String(value ?? "")
    .replace(/\s+/gu, "")
    .replace(/[^\p{Letter}\p{Number}+#.]/gu, "")
    .toLowerCase();
}

function bigrams(value) {
  const text = normalized(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}

function isSupportedPhrase(candidate, source, minimumCoverage = 0.55) {
  const candidateText = normalized(candidate);
  const sourceText = normalized(source);
  if (!candidateText || !sourceText) return false;
  if (sourceText.includes(candidateText)) return true;
  const candidateBigrams = bigrams(candidateText);
  const sourceBigrams = bigrams(sourceText);
  const shared = Array.from(candidateBigrams).filter((token) => sourceBigrams.has(token)).length;
  return candidateBigrams.size > 0 && shared / candidateBigrams.size >= minimumCoverage;
}

function stringArray(value, minimum, maximum, gate) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(gate);
  const result = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (result.some((item) => !item)) fail(gate);
  return result;
}

function collectGreetingFactIds(plan) {
  return Array.from(new Set([
    ...(Array.isArray(plan?.directFactIds) ? plan.directFactIds : []),
    ...(Array.isArray(plan?.transferableEvidence)
      ? plan.transferableEvidence.map((item) => item?.factId)
      : []),
    ...(Array.isArray(plan?.supportingFactIds) ? plan.supportingFactIds : []),
  ].filter((item) => typeof item === "string" && item)));
}

function normalizeGreetingPlan(input, { facts, jd, rawJdText }) {
  if (!isPlainObject(input)) fail("match_plan_schema");
  const responseKeys = new Set([
    ...PLAN_KEYS,
    "responsibilities",
    "hardSkills",
    "experienceEducation",
    "locationWorkMode",
    "availabilityDuration",
  ]);
  if (
    PLAN_KEYS.some((key) => !(key in input)) ||
    Object.keys(input).some((key) => !responseKeys.has(key))
  ) fail("match_plan_keys");
  if (typeof input.jobTitle !== "string" || typeof input.companyName !== "string") {
    fail("target_field_type");
  }

  const factIds = new Set(facts.map(({ factId }) => factId));
  if (typeof rawJdText !== "string" || !rawJdText.trim()) fail("raw_jd_missing");
  const rawNormalized = normalized(rawJdText);
  const extractedJdFields = JD_LIST_KEYS.flatMap((key) => Array.isArray(jd[key]) ? jd[key] : []);
  if (extractedJdFields.some(({ text }) => !isSupportedPhrase(text, rawJdText))) {
    fail("jd_field_not_in_current_input");
  }
  const coreFunctions = Array.isArray(input.coreFunctions) ? input.coreFunctions : [];
  if (coreFunctions.length < 2 || coreFunctions.length > 5) fail("core_functions");
  if (coreFunctions.some((item) => {
    if (
      !isPlainObject(item) ||
      !JD_LIST_KEYS.includes(item.requirementType) ||
      !Number.isInteger(item.requirementIndex) ||
      typeof item.summary !== "string" ||
      !item.summary.trim()
    ) return true;
    const requirement = jd[item.requirementType]?.[item.requirementIndex];
    return !requirement || !isSupportedPhrase(item.summary, requirement.text, 0.35);
  })) fail("core_function_source");

  const directFactIds = stringArray(input.directFactIds, 0, 4, "direct_fact_ids");
  const supportingFactIds = stringArray(input.supportingFactIds, 0, 4, "supporting_fact_ids");
  const transferableEvidence = Array.isArray(input.transferableEvidence)
    ? input.transferableEvidence
    : fail("transferable_evidence");
  if (transferableEvidence.length > 4 || transferableEvidence.some((item) =>
    !isPlainObject(item) ||
    typeof item.factId !== "string" ||
    typeof item.capability !== "string" ||
    !item.capability.trim() ||
    !["transferable", "foundation"].includes(item.wordingStrength)
  )) fail("transferable_evidence");

  const allFactIds = [
    ...directFactIds,
    ...transferableEvidence.map(({ factId }) => factId),
    ...supportingFactIds,
  ];
  if (new Set(allFactIds).size !== allFactIds.length) fail("fact_tier_duplicate");
  if (allFactIds.some((factId) => !factIds.has(factId))) fail("fact_source");

  const matchMode = input.matchMode;
  if (!["strong", "partial", "low"].includes(matchMode)) fail("match_mode");
  const gaps = stringArray(input.gaps, 0, 5, "gaps");
  if (matchMode === "strong" && directFactIds.length === 0) fail("strong_without_direct");
  if (matchMode === "partial" && (transferableEvidence.length === 0 || gaps.length === 0)) {
    fail("partial_without_transfer");
  }
  if (
    matchMode === "low" &&
    (directFactIds.length > 0 ||
      transferableEvidence.length > 0 ||
      supportingFactIds.length === 0 ||
      gaps.length === 0)
  ) fail("low_evidence_invalid");

  const expectedJobTitle = jd.jobTitle?.text || "该岗位";
  const expectedCompanyName = jd.companyName?.text || "";
  if (normalized(input.jobTitle) !== normalized(expectedJobTitle)) fail("job_title_mismatch");
  if (normalized(input.companyName) !== normalized(expectedCompanyName)) fail("company_mismatch");
  if (expectedJobTitle !== "该岗位" && !rawNormalized.includes(normalized(expectedJobTitle))) {
    fail("job_title_not_in_current_input");
  }
  if (expectedCompanyName && !rawNormalized.includes(normalized(expectedCompanyName))) {
    fail("company_not_in_current_input");
  }

  const paragraphs = stringArray(input.paragraphs, 3, 4, "paragraph_count");
  const domainContext = stringArray(input.domainContext, 0, 4, "domain_context");
  if (domainContext.some((item) => !rawNormalized.includes(normalized(item)))) {
    fail("domain_context_source");
  }

  return {
    jobTitle: input.jobTitle.trim(),
    companyName: input.companyName.trim(),
    coreFunctions: coreFunctions.map(({ requirementType, requirementIndex, summary }) => ({
      requirementType,
      requirementIndex,
      summary: summary.trim(),
    })),
    domainContext,
    matchMode,
    directFactIds,
    transferableEvidence: transferableEvidence.map(({ factId, capability, wordingStrength }) => ({
      factId,
      capability: capability.trim(),
      wordingStrength,
    })),
    supportingFactIds,
    gaps,
    paragraphs,
  };
}

function assertDomainTermsSupported(body, { jdText, factTexts }) {
  const source = normalized([jdText, ...factTexts].join("\n"));
  for (const term of DOMAIN_TERMS) {
    if (normalized(body).includes(normalized(term)) && !source.includes(normalized(term))) {
      fail("cross_jd_domain_term");
    }
  }
}

function assertNamedTermsSupported(body, { companyName, factTexts }) {
  const factSource = normalized(factTexts.join("\n"));
  const organizationSource = normalized([companyName, ...factTexts].join("\n"));
  const controlledTerms = CONTROLLED_PROFESSIONAL_TERMS.filter((term) =>
    normalized(body).includes(normalized(term)),
  );
  const namedOrganizations = body.match(NAMED_ORGANIZATION_PATTERN) || [];
  for (const term of controlledTerms) {
    if (!factSource.includes(normalized(term))) fail("unsupported_professional_term");
  }
  for (const organization of namedOrganizations) {
    if (!organizationSource.includes(normalized(organization))) {
      fail("unsupported_organization");
    }
  }
}

function blockedTermsFromGaps(gaps) {
  const gapText = normalized(gaps.join("\n"));
  return DOMAIN_TERMS.filter((term) => gapText.includes(normalized(term)));
}

function assertParagraphWording(paragraph, tier, blockedTerms) {
  if (tier === "direct") return;
  for (const sentence of paragraph.split(/[。！？!?；;]/u).map((item) => item.trim()).filter(Boolean)) {
    const mentionsBlockedTerm = blockedTerms.some((term) =>
      normalized(sentence).includes(normalized(term)),
    );
    if (
      mentionsBlockedTerm &&
      DIRECT_EXPERIENCE_PATTERNS.some((pattern) => pattern.test(sentence)) &&
      !NEGATED_DIRECT_PATTERN.test(sentence)
    ) {
      fail("evidence_strength_mismatch");
    }
  }
}

function evidenceTierForFact(plan, factId) {
  if (plan.directFactIds.includes(factId)) return "direct";
  if (plan.transferableEvidence.some((item) => item.factId === factId)) return "transferable";
  return "supporting";
}

module.exports = {
  PLAN_KEYS,
  assertDomainTermsSupported,
  assertNamedTermsSupported,
  assertParagraphWording,
  blockedTermsFromGaps,
  collectGreetingFactIds,
  evidenceTierForFact,
  normalizeGreetingPlan,
};
```

- [ ] **Step 4: Run the runtime gate tests**

Run:

```bash
npx vitest run tests/unit/greeting-calibration.test.ts
```

Expected: PASS with five tests and no network calls.

- [ ] **Step 5: Commit the isolated runtime gate**

```bash
git add cloudfunctions/worker/deploy/greeting-calibration.js tests/unit/greeting-calibration.test.ts
git commit -m "feat: validate greeting evidence maturity"
```

### Task 3: Lock Synthetic Investment, Financial-AI, and SEO Routing Cases

**Files:**
- Create: `tests/helpers/synthetic-greeting-calibration-cases.ts`
- Modify: `tests/unit/experience-worker-privacy.test.ts`
- Modify: `cloudfunctions/worker/deploy/experience-worker.js`

- [ ] **Step 1: Add three synthetic route fixtures**

Create `tests/helpers/synthetic-greeting-calibration-cases.ts`:

```ts
function fitGoldParagraphs(paragraphs: string[], filler: string): string[] {
  const visibleLength = (value: string) => value.replace(/\s+/gu, "").length;
  const fitted = [...paragraphs];
  while (visibleLength(fitted.join("\n")) < 360) fitted[fitted.length - 1] += filler;
  if (visibleLength(fitted.join("\n")) > 450) {
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
      responsibilities: ["开展行业研究和公司基本面分析", "完成估值建模并输出投资报告"],
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
        "您好，我是南方理工大学金融科技专业在读学生，专业排名前百分之五，希望应聘澄明资本的战略投资实习生。",
        "我独立完成过星河食品的完整投资研究，从行业格局、公司基本面和财务预测出发，进一步搭建DCF估值框架、测算WACC并完成敏感性分析，最终输出投资报告。",
        "我也完成过海外上市公司的CAPM、Beta、PE与风险收益分析，能够用另一组方法验证公司判断，不会把单一模型结论直接当作最终答案。",
        "我每周可稳定投入三天，并可连续实习四个月，希望有机会进一步沟通岗位中的研究任务和交付要求。",
      ], "我习惯把关键假设、分析过程和结论整理清楚，便于后续复核与讨论。"),
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
        "您好，我是南方理工大学金融科技专业在读学生，希望应聘远景科技的金融AI Agent产品实习生，我在AI评测和产品实践两方面都有真实积累。",
        "我参与过五千余条合成对话Case的质量复核和模型评测，会围绕输出质量识别高频失败问题，并通过失败归因、Prompt调整和A/B Test观察策略变化。",
        "我还独立完成过生成式AI消费分析产品，从需求拆解、Prompt设计到测试和部署完整推进，能够从产品流程理解模型能力如何落到用户场景。",
        "金融科技专业背景也让我能够理解金融业务语境，希望进一步了解团队当前的模型评测标准、Case迭代方式和Agent优化重点。",
      ], "我会把问题现象、判断依据和验证结果整理为结构化记录，支持后续复盘。"),
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
      requiredPhrases: ["没有完整负责过SEO", "网站", "数据", "迁移"],
      forbiddenPhrases: ["熟悉SEO", "独立开展关键词研究", "提升自然流量", "Google Search Console"],
    },
    modelOutput: {
      jobTitle: "SEO经理",
      companyName: "远航网络",
      responsibilities: ["制定并执行搜索引擎优化策略", "监测搜索表现并持续迭代"],
      hardSkills: ["独立进行关键词研究", "熟悉自然排名优化"],
      experienceEducation: [],
      locationWorkMode: [],
      availabilityDuration: [],
      coreFunctions: [
        { requirementType: "responsibilities", requirementIndex: 0, summary: "搜索引擎优化策略" },
        { requirementType: "responsibilities", requirementIndex: 1, summary: "搜索数据监测与迭代" },
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
        "您好，我希望应聘远航网络的SEO经理。虽然我没有完整负责过SEO项目和关键词研究，但我有实际的网站落地、数据分析和实验迭代经历，希望把这些方法迁移到搜索增长方向。",
        "我独立完成过Web产品的页面搭建、测试、问题修复和部署，对网站从开发到上线的基本流程并不陌生，但不会把这段经历表述成Technical SEO经验。",
        "我也会使用SQL、表格和可视化工具分析数据，并在业务项目中根据指标定位问题、调整方案，再通过A/B Test验证结果，这种工作方法具备一定迁移基础。",
        "此外，我能够检索和阅读英文资料。若团队接受具备相邻能力、需要继续补足SEO专项方法的候选人，希望有机会进一步沟通。",
      ], "我会保持对经验边界的准确说明，并用真实数据验证后续判断。"),
    },
  },
} as const;
```

- [ ] **Step 2: Add failing routing and ranking assertions**

In `tests/unit/experience-worker-privacy.test.ts`, import the fixtures and add:

```ts
it("prioritizes core job functions before finance context and job labels", () => {
  for (const calibrationCase of Object.values(syntheticGreetingCalibrationCases)) {
    expect(classifyRoleFamily(calibrationCase.jd)).toBe(calibrationCase.expectedFamily);
    expect(rankFactsForText(calibrationCase.facts, calibrationCase.jd)[0]?.factId)
      .toBe(calibrationCase.expectedFirstFactId);
  }
});

it("does not route a financial AI evaluation role to investment research", () => {
  expect(classifyRoleFamily(syntheticGreetingCalibrationCases.financialAiAgent.jd))
    .toBe("ai_evaluation_product");
});
```

Add `rankFactsForText` to the worker test require type and exported members.

- [ ] **Step 3: Run the route test and confirm the current finance-first failure**

Run:

```bash
npx vitest run tests/unit/experience-worker-privacy.test.ts -t "core job functions|financial AI"
```

Expected: FAIL because the current classifier returns `ai_finance_research` before checking model evaluation, and `seo_growth` does not exist.

- [ ] **Step 4: Correct route order and SEO evidence strategy**

Add this strategy to `ROLE_STRATEGIES` in `cloudfunctions/worker/deploy/experience-worker.js`:

```js
seo_growth: "没有直接 SEO 证据时进入部分匹配；只说明网站实操、数据分析和实验迭代如何迁移，不得改写成关键词研究、自然排名或 Technical SEO 经验。",
```

Replace `classifyRoleFamily` with:

```js
function classifyRoleFamily(value) {
  const text = String(value ?? "").toLowerCase();
  const hasAi = /(?:\bai\b|大语言模型|大模型|llm|agent|智能体|模型评测|生成式)/iu.test(text);
  const hasFinance = /(?:投研|投资|金融|财务|估值|dcf|研报|行业研究|证券|基金)/iu.test(text);
  if (/(?:融资|募资|路演|投资者关系|尽调材料)/iu.test(text)) return "fundraising_execution";
  if (/(?:seo|搜索引擎优化|关键词研究|自然搜索|自然排名|search console)/iu.test(text)) {
    return "seo_growth";
  }
  if (/(?:模型评测|模型评估|回复质量|错误归因|评测集|badcase|数据标注|人机对齐|a\/b test)/iu.test(text)) {
    return "ai_evaluation_product";
  }
  if (hasAi && hasFinance) return "ai_finance_research";
  if (hasFinance) return "investment_research";
  if (hasAi && /(?:企业服务|商业化|业务方案|解决方案|售前|客户)/iu.test(text)) {
    return "ai_business_product";
  }
  if (hasAi && /(?:产品|需求|原型|用户|迭代|功能)/iu.test(text)) return "ai_product_builder";
  if (/(?:产品|需求|原型|用户研究|版本迭代)/iu.test(text)) return "general_product";
  return "general";
}
```

Add this route to `roleEvidenceBonus`:

```js
seo_growth: /(?:网站|web|页面|部署|数据|指标|实验|a\/b|英文资料)/iu,
```

Add `rankFactsForText` to `module.exports`:

```js
rankFactsForText,
```

- [ ] **Step 5: Run all worker privacy tests**

Run:

```bash
npx vitest run tests/unit/experience-worker-privacy.test.ts
```

Expected: PASS, including the AI evaluation route preceding the finance context route.

- [ ] **Step 6: Commit route and synthetic fixture changes**

```bash
git add cloudfunctions/worker/deploy/experience-worker.js tests/helpers/synthetic-greeting-calibration-cases.ts tests/unit/experience-worker-privacy.test.ts
git commit -m "fix: prioritize greeting role core functions"
```

### Task 4: Replace the v7 Prompt with a Compact v8 Match Plan

**Files:**
- Modify: `cloudfunctions/worker/deploy/experience-worker.js`
- Modify: `tests/unit/experience-worker-privacy.test.ts`
- Modify: `tests/integration/experience-real-ai-regression.test.ts`

- [ ] **Step 1: Replace v7 prompt-string expectations with v8 expectations**

Replace the fixed-first-and-last-sentence test in `tests/unit/experience-worker-privacy.test.ts` with:

```ts
it("requests a compact evidence plan and adaptive three-to-four paragraph body", () => {
  const prompt = jdPrompt("示例科技招聘 AI 产品实习生", facts);

  expect(prompt).toContain('"matchMode":"strong"');
  expect(prompt).toContain('"directFactIds"');
  expect(prompt).toContain('"transferableEvidence"');
  expect(prompt).toContain('"supportingFactIds"');
  expect(prompt).toContain('"gaps"');
  expect(prompt).toContain("350至450个可见字符");
  expect(prompt).toContain("3至4个非空段落");
  expect(prompt).toContain("核心功能 > 行业背景 > 加分标签");
  expect(prompt).not.toContain("第一段必须以“您好！”开始");
  expect(prompt).not.toContain("第三段必须以“期待得到您的回复！”结尾");
  expect(prompt).not.toContain('"selectedFactIds"');
});
```

Update `tests/integration/experience-real-ai-regression.test.ts` to assert:

```ts
expect(worker).toContain('"matchMode"');
expect(worker).toContain('"directFactIds"');
expect(worker).toContain('"transferableEvidence"');
expect(worker).toContain('"paragraphs"');
expect(worker).not.toContain('"selectedFactIds"');
expect(worker).toContain("experience-evidence-planned-v8");
expect(worker).toContain("maxTokens: 1_300");
expect(worker).toContain("timeoutMs: 10_000");
```

- [ ] **Step 2: Run prompt regression tests and confirm they fail on v7**

Run:

```bash
npx vitest run tests/unit/experience-worker-privacy.test.ts tests/integration/experience-real-ai-regression.test.ts
```

Expected: FAIL because the current Prompt uses `selectedFactIds`, exactly three paragraphs, and fixed salutation and closing.

- [ ] **Step 3: Replace `jdPrompt` with the v8 single-call prompt**

Replace the whole `jdPrompt` function in `cloudfunctions/worker/deploy/experience-worker.js` with:

```js
function jdPrompt(text, facts) {
  const roleFamily = classifyRoleFamily(text);
  const safeFacts = rankFactsForText(facts, text, roleFamily).slice(0, 10).map(
    ({ factId: id, sourceType, text: factText }) => ({
      factId: id,
      sourceType,
      text: compactText(factText, 280),
    }),
  );
  return `你是中文求职开场白编辑。岗位路线：${roleFamily}。路线规则：${ROLE_STRATEGIES[roleFamily]}
你必须在一次 JSON 响应中完成岗位理解、证据分层和正文写作，不输出解释、推理过程、Markdown 或产品层 AI 标识。
判断顺序固定为：核心功能 > 行业背景 > 加分标签。先从 JD 提取六类字段；coreFunctions 必须用 requirementType 和 requirementIndex 引用本次响应中对应 JD 数组的项目。金融、教育、消费等 domainContext 只能描述业务场景，不能覆盖核心功能。
证据分层：directFactIds 只放真实完成过对应核心工作的事实；transferableEvidence 只放方法相似但业务对象不同的事实，并标明 transferable 或 foundation；supportingFactIds 只放专业、成绩、工具、行业理解和到岗条件。禁止把完整项目写成“练习、尝试、接触过”，也禁止把网站开发改名为 SEO、把数据分析改名为 SEO Analytics。
matchMode：strong 至少有一项核心直接证据；partial 用一句话诚实披露 JD 明确要求但缺少的直接经验，再说明可迁移证据；low 没有足够直接或可迁移证据，只写真实背景、相关基础和投入条件，不得声称高度匹配或能够快速上手。
正文硬规则：简体中文；350至450个可见字符；3至4个非空段落；第一段自然包含“您好”，优先写“您好，我是…”；结尾根据证据和匹配模式自然收束，不固定句式；必须准确出现当前公司称呼和岗位名；每个数字、专业、学校、经历、方法、工具和结果只能来自可引用事实。
表达规则：专业、自然、自信但不过度包装。通过事实让 HR 得出匹配结论；保留有用数字、方法和专业术语；不机械罗列所有事实。禁用“本人具备”“贵公司是行业领先者”“希望贴近真实工作”“愿意踏实学习”“分析练习”“这些练习”“看到岗位主要围绕”“这些要求与我的经历和能力比较契合”“这段积累能支持我”。
返回前检查：岗位名与当前 JD 一致；没有其他 JD 的职责和术语；direct、transferable、supporting 的措辞强度一致；正文长度和段落数合格。服务端不会进行第二次模型调用，也不会用本地模板补写。
只返回 {"jobTitle":"","companyName":"","responsibilities":[],"hardSkills":[],"experienceEducation":[],"locationWorkMode":[],"availabilityDuration":[],"coreFunctions":[{"requirementType":"responsibilities","requirementIndex":0,"summary":""},{"requirementType":"responsibilities","requirementIndex":1,"summary":""}],"domainContext":[],"matchMode":"strong","directFactIds":[],"transferableEvidence":[{"factId":"","capability":"","wordingStrength":"transferable"}],"supportingFactIds":[],"gaps":[],"paragraphs":["","",""]}。
JD：${maskProtectedText(text).slice(0, 6_000)}
可引用事实：${JSON.stringify(safeFacts)}`;
}
```

- [ ] **Step 4: Run prompt tests and inspect the generated string once**

Run:

```bash
npx vitest run tests/unit/experience-worker-privacy.test.ts -t "compact evidence plan"
npx vitest run tests/integration/experience-real-ai-regression.test.ts -t "single-call"
```

Expected: PASS. The printed Prompt must not be added to logs or committed as a runtime artifact.

- [ ] **Step 5: Commit the v8 Prompt contract**

```bash
git add cloudfunctions/worker/deploy/experience-worker.js tests/unit/experience-worker-privacy.test.ts tests/integration/experience-real-ai-regression.test.ts
git commit -m "feat: add evidence-planned greeting prompt"
```

### Task 5: Integrate Plan Validation, Per-Paragraph Evidence, and v8 Disclosure

**Files:**
- Modify: `cloudfunctions/worker/deploy/experience-worker.js`
- Modify: `tests/unit/experience-worker-privacy.test.ts`
- Modify: `tests/unit/experience-worker-errors.test.ts`
- Modify: `tests/integration/generation-quality-execution.test.ts`

- [ ] **Step 1: Write failing package tests for adaptive language and evidence maturity**

Add these tests to `tests/unit/experience-worker-privacy.test.ts`:

```ts
import { syntheticGreetingCalibrationCases } from
  "../helpers/synthetic-greeting-calibration-cases.js";

const { buildJdSnapshot } = require(
  "../../cloudfunctions/worker/deploy/experience-worker.js",
) as {
  buildJdSnapshot(input: unknown): JobDescription;
};
const { normalizeGreetingPlan } = require(
  "../../cloudfunctions/worker/deploy/greeting-calibration.js",
) as {
  normalizeGreetingPlan(
    input: unknown,
    context: { facts: Fact[]; jd: JobDescription; rawJdText: string },
  ): Record<string, unknown> & { paragraphs: string[] };
};

function preparedCase(
  calibrationCase: (typeof syntheticGreetingCalibrationCases)[keyof typeof syntheticGreetingCalibrationCases],
  modelOutput: unknown = calibrationCase.modelOutput,
) {
  const jdSnapshot = buildJdSnapshot(modelOutput);
  const plan = normalizeGreetingPlan(modelOutput, {
    facts: [...calibrationCase.facts],
    jd: jdSnapshot,
    rawJdText: calibrationCase.jd,
  });
  const matches = buildFactMatches(plan, jdSnapshot, [...calibrationCase.facts]);
  return { jdSnapshot, matches, plan };
}

it("keeps a natural salutation and adaptive closing without rewriting them", () => {
  const calibrationCase = syntheticGreetingCalibrationCases.investment;
  const { jdSnapshot, matches, plan } = preparedCase(calibrationCase);
  const result = modelGreetingPackage(
    plan,
    jdSnapshot,
    matches,
    [...calibrationCase.facts],
  );

  expect(result.body).toBe(plan.paragraphs.join("\n"));
  expect(result.body).toMatch(/^您好，我是/u);
  expect(result.body).not.toMatch(/期待得到您的回复！$/u);
  expect(result.body.split("\n")).toHaveLength(4);
  expect(result.evidence).toHaveLength(4);
});

it("never reintroduces a resume fact omitted by the match plan", () => {
  const calibrationCase = syntheticGreetingCalibrationCases.investment;
  const { matches } = preparedCase(calibrationCase);

  expect(matches.map(({ fact }) => fact.factId)).toEqual([
    "fact_investment",
    "fact_equity",
    "fact_school",
    "fact_availability",
  ]);
  expect(matches.some(({ fact }) => fact.factId === "fact_ai")).toBe(false);
});

it("rejects an SEO direct-experience claim supported only by transferable facts", () => {
  const calibrationCase = syntheticGreetingCalibrationCases.seo;
  const modelOutput = {
    ...calibrationCase.modelOutput,
    paragraphs: calibrationCase.modelOutput.paragraphs.map((paragraph) =>
      paragraph.replace("具备一定迁移基础", "已经独立负责过完整SEO策略"),
    ),
  };
  const { jdSnapshot, matches, plan } = preparedCase(calibrationCase, modelOutput);

  expect(() =>
    modelGreetingPackage(
      plan,
      jdSnapshot,
      matches,
      [...calibrationCase.facts],
    ),
  ).toThrow("MODEL_INVALID_OUTPUT");
});

it("rejects an AI Agent greeting polluted by investment-research duties", () => {
  const calibrationCase = syntheticGreetingCalibrationCases.financialAiAgent;
  const modelOutput = {
    ...calibrationCase.modelOutput,
    paragraphs: calibrationCase.modelOutput.paragraphs.map((paragraph) =>
      paragraph.replace("模型评测", "投研知识库与研报提取"),
    ),
  };
  const { jdSnapshot, matches, plan } = preparedCase(calibrationCase, modelOutput);

  expect(() =>
    modelGreetingPackage(
      plan,
      jdSnapshot,
      matches,
      [...calibrationCase.facts],
    ),
  ).toThrow("MODEL_INVALID_OUTPUT");
});
```

- [ ] **Step 2: Run the package tests and confirm current normalization fails**

Run:

```bash
npx vitest run tests/unit/experience-worker-privacy.test.ts -t "natural salutation|SEO direct|polluted"
```

Expected: FAIL because v7 forces fixed greeting/closing and does not validate match-plan tiers or domain contamination.

- [ ] **Step 3: Import the calibration functions into the worker**

Add this require beside the existing local requires in `cloudfunctions/worker/deploy/experience-worker.js`:

```js
const {
  assertDomainTermsSupported,
  assertNamedTermsSupported,
  assertParagraphWording,
  blockedTermsFromGaps,
  collectGreetingFactIds,
  evidenceTierForFact,
  normalizeGreetingPlan,
} = require("./greeting-calibration.js");
```

Replace `buildFactMatches` completely so an omitted resume fact can never return
through the old fallback path:

```js
function buildFactMatches(selection, jd, facts) {
  const factMap = new Map(facts.map((fact) => [fact.factId, fact]));
  const requirements = requirementEntries(jd);
  const selectedIds = collectGreetingFactIds(selection);
  if (selectedIds.length === 0 || requirements.length === 0) {
    throw new Error("INSUFFICIENT_FACTS");
  }

  const selectedFacts = selectedIds.map((factId) => factMap.get(factId));
  if (selectedFacts.some((fact) => !fact)) {
    throw new Error("MODEL_INVALID_OUTPUT");
  }

  return selectedFacts.map((fact) => {
    const requirement = requirements
      .map((candidate, requirementIndex) => ({
        candidate,
        requirementIndex,
        score:
          similarityScore(fact.text, candidate.text) +
          sourceCompatibility(fact.sourceType, candidate.requirementType),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.requirementIndex - right.requirementIndex,
      )[0]?.candidate;
    if (!requirement) throw new Error("INSUFFICIENT_FACTS");
    return { fact, requirement };
  });
}
```

Do not retain the old `selection.matches`, `selectedFactIds`, `candidateFacts`,
or all-facts fallback branches. v8 accepts only the ten plan keys enforced by
`normalizeGreetingPlan`.

- [ ] **Step 4: Replace `modelGreetingPackage` with the v8 deterministic gate**

Replace the whole function with:

```js
function modelGreetingPackage(plan, jd, matches, facts) {
  const paragraphs = plan.paragraphs.map((item) => item.trim()).filter(Boolean);
  const body = paragraphs.join("\n");
  const outputVisibleLength = visibleLength(body);
  if (outputVisibleLength < 350 || outputVisibleLength > 450) {
    throw modelValidationFailure("greeting_length", {
      visibleLength: outputVisibleLength,
      paragraphCount: paragraphs.length,
    });
  }
  if (paragraphs.length < 3 || paragraphs.length > 4) {
    throw modelValidationFailure("greeting_paragraph_count", {
      visibleLength: outputVisibleLength,
      paragraphCount: paragraphs.length,
    });
  }
  if (!/^您好(?:[，,!！。]|$)/u.test(paragraphs[0])) {
    throw modelValidationFailure("greeting_salutation", {
      visibleLength: outputVisibleLength,
      paragraphCount: paragraphs.length,
    });
  }
  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(body) ||
    /(?<!\d)1[3-9]\d{9}(?!\d)/u.test(body) ||
    /\[MASKED_(?:PHONE|EMAIL|ID|ADDRESS)\]/u.test(body) ||
    /作为(?:一个)?AI|根据(?:你|您)提供的简历|```|^\s*#|本人具备|贵公司是行业领先者|希望贴近真实工作|愿意踏实学习|分析练习|这些练习|看到岗位主要围绕|这些要求与我的经历和能力比较契合|这段积累能支持我/mu.test(body)
  ) {
    throw modelValidationFailure("greeting_forbidden_content", {
      visibleLength: outputVisibleLength,
      paragraphCount: paragraphs.length,
    });
  }

  const role = jd.jobTitle?.text || "该岗位";
  const company = jd.companyName?.text || "贵司";
  if (!mentionsTarget(body, role, "该岗位") || !mentionsTarget(body, company, "贵司")) {
    throw modelValidationFailure("greeting_target_mention", {
      visibleLength: outputVisibleLength,
      paragraphCount: paragraphs.length,
    });
  }

  const selectedFacts = new Map(
    facts
      .filter(({ factId }) => collectGreetingFactIds(plan).includes(factId))
      .map((fact) => [fact.factId, fact]),
  );
  assertDomainTermsSupported(body, {
    jdText: JSON.stringify(jd),
    factTexts: Array.from(selectedFacts.values(), ({ text }) => text),
  });
  assertNamedTermsSupported(body, {
    companyName: company,
    factTexts: Array.from(selectedFacts.values(), ({ text }) => text),
  });
  const blockedTerms = blockedTermsFromGaps(plan.gaps);

  const evidence = paragraphs.map((paragraph, paragraphIndex) => {
    const ranked = matches.map((match, matchIndex) => ({
      match,
      matchIndex,
      score:
        similarityScore(paragraph, match.fact.text) +
        similarityScore(paragraph, match.requirement.text),
    })).sort((left, right) => right.score - left.score || left.matchIndex - right.matchIndex);
    const selected = ranked[0];
    const sources = [];
    let hasFactSource = false;
    if (paragraphIndex === 0 && jd.jobTitle) {
      sources.push({ type: "jd", fieldId: jd.jobTitle.fieldId });
    }
    if (paragraphIndex === 0 && jd.companyName) {
      sources.push({ type: "jd", fieldId: jd.companyName.fieldId });
    }
    if (selected && selected.score >= 2) {
      const tier = evidenceTierForFact(plan, selected.match.fact.factId);
      assertParagraphWording(paragraph, tier, blockedTerms);
      hasFactSource = true;
      sources.push(
        { type: "fact", factId: selected.match.fact.factId },
        { type: "jd", fieldId: selected.match.requirement.fieldId },
      );
    }
    if (!hasFactSource || sources.length === 0) {
      throw modelValidationFailure("greeting_evidence_alignment", {
        visibleLength: outputVisibleLength,
        paragraphCount: paragraphs.length,
        paragraphIndex,
      });
    }
    return {
      claimId: `claim_match_${paragraphIndex + 1}`,
      text: paragraph,
      sources,
    };
  });

  const allowedNumericSource = [
    role,
    company,
    ...Array.from(selectedFacts.values(), ({ text }) => text),
  ].join("\n");
  const unsupportedNumbers = (body.match(/\d+(?:[.,]\d+)?%?/gu) || [])
    .filter((number) => !allowedNumericSource.includes(number));
  if (unsupportedNumbers.length > 0) {
    throw modelValidationFailure("greeting_numeric_source", {
      visibleLength: outputVisibleLength,
      paragraphCount: paragraphs.length,
      unsupportedNumericCount: unsupportedNumbers.length,
    });
  }

  return { body, evidence };
}
```

- [ ] **Step 5: Normalize the plan before matching and update disclosure**

In the generation branch, replace the v7 selection flow with:

```js
const rawSelection = await callModel(jdPrompt(rawText, facts), {
  maxTokens: 1_300,
  timeoutMs: 10_000,
  temperature: 0.1,
});
const modelDurationMs = Date.now() - modelStartedAt;
const jdSnapshot = buildJdSnapshot(rawSelection);
const selection = normalizeGreetingPlan(rawSelection, {
  facts,
  jd: jdSnapshot,
  rawJdText: rawText,
});
const matches = buildFactMatches(selection, jdSnapshot, facts);
await jobs.transitionJob(job.jobId, "parsing", "generating", now());
const greetingPackage = modelGreetingPackage(selection, jdSnapshot, matches, facts);
const renderMode = "model_evidence_planned";
```

Change `disclosure()` to:

```js
function disclosure() {
  return {
    mode: "real",
    providerName: "腾讯云 TokenHub",
    modelName: "腾讯混元",
    modelId: process.env.TOKENHUB_MODEL || "hy3",
    promptVersion: "experience-evidence-planned-v8",
    filingReference: process.env.TOKENHUB_FILING_REFERENCE || "腾讯云控制台公示的模型备案信息",
  };
}
```

- [ ] **Step 6: Extend safe error mapping for each deterministic gate**

In `publicProcessingError`, map all v8 validation failures to the existing user-safe error response:

```js
if (error?.message === "MODEL_INVALID_OUTPUT") {
  return {
    code: "MODEL_INVALID_OUTPUT",
    message: "AI 返回内容未通过真实性或格式检查，请重新提交。",
    retryable: true,
  };
}
```

Add assertions in `tests/unit/experience-worker-errors.test.ts` that `match_plan_schema`, `cross_jd_domain_term`, and `evidence_strength_mismatch` never expose their internal names or source content to the client.

- [ ] **Step 7: Run worker, error, and generation tests**

Run:

```bash
npx vitest run tests/unit/experience-worker-privacy.test.ts tests/unit/experience-worker-errors.test.ts tests/integration/generation-quality-execution.test.ts
```

Expected: PASS; the tests perform no TokenHub, OCR, or CloudBase calls.

- [ ] **Step 8: Commit the integrated v8 quality gate**

```bash
git add cloudfunctions/worker/deploy/experience-worker.js tests/unit/experience-worker-privacy.test.ts tests/unit/experience-worker-errors.test.ts tests/integration/generation-quality-execution.test.ts
git commit -m "feat: enforce greeting match plan quality"
```

### Task 6: Align Shared Quality and Rewrite Rules

**Files:**
- Modify: `shared/src/greeting.ts`
- Modify: `cloudfunctions/worker/deploy/experience-worker.js`
- Modify: `cloudfunctions/worker/src/greeting-generation-pipeline.ts`
- Modify: `cloudfunctions/worker/src/greeting-rewrite-pipeline.ts`
- Modify: `tests/unit/greeting-quality.test.ts`
- Modify: `tests/contract/greeting-rewrite-pipeline.test.ts`
- Modify: `tests/integration/generation-rewrite.test.ts`

- [ ] **Step 1: Add failing tests for v8 shared and rewrite rules**

Add to `tests/unit/greeting-quality.test.ts`:

```ts
function draftContaining(sentence: string) {
  const draft = validDraft();
  const paragraphs = [
    `您好，我关注贵司的产品实习生岗位。${draft.claims[0].text}。${sentence}。`,
    "我会先理解真实问题，再整理可以核对的证据，并根据反馈判断方案是否需要调整。",
    "我重视事实边界和清晰沟通，也会记录判断依据、验证结果和下一步行动。",
  ];
  while (countVisibleCharacters(paragraphs.join("\n")) < 360) {
    paragraphs[2] += "我会继续基于真实结果复盘，而不是使用空泛结论。";
  }
  return { ...draft, body: paragraphs.join("\n") };
}

it.each([
  "希望用已有分析练习贴近真实工作",
  "这些练习让我对岗位产生兴趣",
  "愿意踏实学习岗位要求",
])("rejects self-downgrading language: %s", (sentence) => {
  const draft = draftContaining(sentence);
  expect(validateAiGreeting(draft, registry).errors)
    .toContain("MECHANICAL_TEMPLATE_PRESENT");
});
```

Update `tests/contract/greeting-rewrite-pipeline.test.ts` and `tests/integration/generation-rewrite.test.ts` to require 350–450 visible characters, 3–4 paragraphs, natural `您好` semantics, and no fixed closing.

- [ ] **Step 2: Run the rewrite and shared tests and confirm v7 assumptions fail**

Run:

```bash
npx vitest run tests/unit/greeting-quality.test.ts tests/contract/greeting-rewrite-pipeline.test.ts tests/integration/generation-rewrite.test.ts
```

Expected: FAIL on current self-downgrading phrase coverage and exactly-three-paragraph rewrite rules.

- [ ] **Step 3: Extend shared mechanical-language detection**

Add these patterns to `containsMechanicalTemplate` in `shared/src/greeting.ts`:

```ts
/希望用.{0,20}(?:练习|尝试).{0,20}贴近真实工作/iu,
/这些练习/iu,
/分析练习/iu,
/愿意踏实学习/iu,
```

- [ ] **Step 4: Align production rewrite validation**

Replace the rewrite hard rules in `rewritePrompt` with:

```js
正文必须为简体中文、3至4个非空段落、350至450个可见字符；自然保留“您好”的问候语义，但不固定独立首句或固定结尾；保持原 matchMode、事实层级和岗位主线，不得把可迁移能力改成直接经验；不得新增公司、学校、经历、技能、证书、数字、日期或结果。
```

Replace the length and paragraph conditions in `normalizeRewriteModel` with:

```js
if (visibleLength(body) < 350 || visibleLength(body) > 450) {
  throw new Error("GREETING_LENGTH_INVALID");
}
const paragraphs = body.split(/\n+/u).map((item) => item.trim()).filter(Boolean);
if (paragraphs.length < 3 || paragraphs.length > 4) {
  throw new Error("MODEL_INVALID_OUTPUT");
}
if (!/^您好(?:[，,!！。]|$)/u.test(paragraphs[0])) {
  throw new Error("MODEL_INVALID_OUTPUT");
}
```

Append the four self-downgrading expressions from Step 3 to the production forbidden-content regular expression.

- [ ] **Step 5: Align the TypeScript source pipelines**

In `cloudfunctions/worker/src/greeting-generation-pipeline.ts`, set:

```ts
promptVersion: "greeting-evidence-planned-v8",
outputRules: {
  language: "simplified_chinese",
  visibleCharacterRange: "350-450",
  paragraphRange: "3-4",
  oneModelCall: true,
  localFallback: false,
},
```

In `cloudfunctions/worker/src/greeting-rewrite-pipeline.ts`, use the same length and paragraph range and explicitly preserve the latest user text, current evidence sources, and match mode.

- [ ] **Step 6: Run focused rewrite, shared, and pipeline tests**

Run:

```bash
npx vitest run tests/unit/greeting-quality.test.ts tests/contract/greeting-rewrite-pipeline.test.ts tests/integration/generation-rewrite.test.ts tests/integration/generation-quality-execution.test.ts
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit shared and rewrite parity**

```bash
git add shared/src/greeting.ts cloudfunctions/worker/deploy/experience-worker.js cloudfunctions/worker/src/greeting-generation-pipeline.ts cloudfunctions/worker/src/greeting-rewrite-pipeline.ts tests/unit/greeting-quality.test.ts tests/contract/greeting-rewrite-pipeline.test.ts tests/integration/generation-rewrite.test.ts
git commit -m "feat: align greeting rewrite with v8 quality"
```

### Task 7: Add Three Gold-Case Regression Suites and Hard-Failure Cases

**Files:**
- Create: `tests/model-evaluation/greeting-calibration-gold-cases.test.ts`

- [ ] **Step 1: Write the model-evaluation test**

Create `tests/model-evaluation/greeting-calibration-gold-cases.test.ts`:

```ts
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { syntheticGreetingCalibrationCases } from "../helpers/synthetic-greeting-calibration-cases.js";

const require = createRequire(import.meta.url);
const {
  buildFactMatches,
  buildJdSnapshot,
  classifyRoleFamily,
  modelGreetingPackage,
  rankFactsForText,
} = require("../../cloudfunctions/worker/deploy/experience-worker.js");
const { normalizeGreetingPlan } = require(
  "../../cloudfunctions/worker/deploy/greeting-calibration.js",
);

function evaluateOutput(
  calibrationCase: (typeof syntheticGreetingCalibrationCases)[keyof typeof syntheticGreetingCalibrationCases],
  modelOutput: Record<string, unknown>,
) {
  const jd = buildJdSnapshot(modelOutput);
  const plan = normalizeGreetingPlan(modelOutput, {
    facts: calibrationCase.facts,
    jd,
    rawJdText: calibrationCase.jd,
  });
  return {
    jd,
    plan,
    result: modelGreetingPackage(
      plan,
      jd,
      buildFactMatches(plan, jd, calibrationCase.facts),
      calibrationCase.facts,
    ),
  };
}

function runInvalidSyntheticMutation(
  mutation:
    | "job_title_mismatch"
    | "unsourced_number"
    | "cross_jd_domain_term"
    | "transferable_as_direct",
) {
  if (mutation === "job_title_mismatch") {
    const calibrationCase = syntheticGreetingCalibrationCases.investment;
    const modelOutput = structuredClone(calibrationCase.modelOutput) as Record<string, unknown>;
    modelOutput.jobTitle = "市场营销实习生";
    return evaluateOutput(calibrationCase, modelOutput);
  }
  if (mutation === "unsourced_number") {
    const calibrationCase = syntheticGreetingCalibrationCases.investment;
    const modelOutput = structuredClone(calibrationCase.modelOutput) as Record<string, unknown> & {
      paragraphs: string[];
    };
    modelOutput.paragraphs[1] += "并让投资收益提升99%。";
    return evaluateOutput(calibrationCase, modelOutput);
  }
  if (mutation === "cross_jd_domain_term") {
    const calibrationCase = syntheticGreetingCalibrationCases.financialAiAgent;
    const modelOutput = structuredClone(calibrationCase.modelOutput) as Record<string, unknown> & {
      paragraphs: string[];
    };
    modelOutput.paragraphs[1] = modelOutput.paragraphs[1]
      .replace("模型评测", "投研知识库与研报提取");
    return evaluateOutput(calibrationCase, modelOutput);
  }
  const calibrationCase = syntheticGreetingCalibrationCases.seo;
  const modelOutput = structuredClone(calibrationCase.modelOutput) as Record<string, unknown> & {
    paragraphs: string[];
  };
  modelOutput.paragraphs[2] = modelOutput.paragraphs[2]
    .replace("具备一定迁移基础", "已经独立负责过完整SEO策略");
  return evaluateOutput(calibrationCase, modelOutput);
}

describe("greeting calibration gold cases", () => {
  it.each(Object.entries(syntheticGreetingCalibrationCases))(
    "%s keeps the confirmed role, evidence priority, and wording strength",
    (_caseId, calibrationCase) => {
      const { plan, result } = evaluateOutput(
        calibrationCase,
        calibrationCase.modelOutput,
      );

      expect(classifyRoleFamily(calibrationCase.jd)).toBe(calibrationCase.expectedFamily);
      expect(rankFactsForText(calibrationCase.facts, calibrationCase.jd)[0]?.factId)
        .toBe(calibrationCase.expectedFirstFactId);
      expect(plan.matchMode).toBe(calibrationCase.expected.matchMode);
      expect(plan.directFactIds).toEqual(calibrationCase.expected.directFactIds);
      expect(plan.transferableEvidence.map(({ factId }) => factId))
        .toEqual(calibrationCase.expected.transferableFactIds);
      for (const phrase of calibrationCase.expected.requiredPhrases) {
        expect(result.body).toContain(phrase);
      }
      for (const phrase of calibrationCase.expected.forbiddenPhrases) {
        expect(result.body).not.toContain(phrase);
      }
      expect(result.evidence).toHaveLength(plan.paragraphs.length);
    },
  );

  it("rejects role-name mismatch, unsourced numbers, cross-JD terms, and tier overclaims", () => {
    for (const mutation of [
      "job_title_mismatch",
      "unsourced_number",
      "cross_jd_domain_term",
      "transferable_as_direct",
    ] as const) {
      expect(() => runInvalidSyntheticMutation(mutation)).toThrow("MODEL_INVALID_OUTPUT");
    }
  });
});
```

- [ ] **Step 2: Run the offline model-evaluation suite**

Run:

```bash
npx vitest run tests/model-evaluation/greeting-calibration-gold-cases.test.ts
```

Expected: PASS for all three gold routes and all four single-fault mutations, with no network calls.

- [ ] **Step 3: Run all model-evaluation tests**

Run:

```bash
npm run test:model
```

Expected: exit 0; existing OCR, TokenHub phase-0, cost and decision-report artifacts remain unchanged.

- [ ] **Step 4: Commit the offline gold suite**

```bash
git add tests/model-evaluation/greeting-calibration-gold-cases.test.ts
git commit -m "test: add greeting calibration gold cases"
```

### Task 8: Synchronize Documentation and Run the Complete Local Gate

**Files:**
- Modify: `docs/phase-10/greeting-quality-calibration.md`
- Modify: `docs/phase-10/experience-version-upload-guide.md`
- Modify: `memory-bank/design-document.md`
- Modify: `memory-bank/tech-stack.md`
- Modify: `memory-bank/implementation-plan.md`
- Modify: `memory-bank/progress.md`
- Modify: `memory-bank/architecture.md`

- [ ] **Step 1: Update the quality calibration document**

Replace every v7 rule in `docs/phase-10/greeting-quality-calibration.md` with the confirmed v8 rules:

```markdown
- Prompt 版本：`experience-evidence-planned-v8`
- 模型调用：一次；不自动重试；不使用本地正文兜底
- 正文：350–450 个可见字符，3–4 个非空段落
- 问候：自然包含“您好”，不固定为独立首句
- 结尾：按匹配模式自适应，不固定句式
- 匹配模式：`strong` / `partial` / `low`
- 岗位判断：核心功能 > 行业背景 > 加分标签
- 证据层级：直接证据 / 可迁移能力 / 背景辅助
- 硬失败：岗位理解错误、跨 JD 串台、事实虚构、可迁移能力冒充直接经验
```

Document the three synthetic gold routes and the 100-point human rubric from the confirmed design. Do not copy the user’s real school, company, project, JD, or generated text into the repository.

- [ ] **Step 2: Update the upload guide**

In `docs/phase-10/experience-version-upload-guide.md`, replace the old v7 manual check with:

```markdown
人工检查正文是否为 350–450 个可见字符、3–4 段，并自然包含“您好”；不再要求固定“您好！”首句或固定“期待得到您的回复！”结尾。模型披露的 Prompt 版本必须为 `experience-evidence-planned-v8`，`processingMetrics.renderMode` 必须为 `model_evidence_planned`。
```

- [ ] **Step 3: Synchronize all memory-bank documents**

Apply these exact decisions:

- `design-document.md`: 写入 350–450 字、3–4 段、三类匹配模式、一次模型调用、三组人工金标准。
- `tech-stack.md`: 说明校准使用 Zod 共享 Schema 和无依赖 CommonJS 生产校准器，不新增 npm 依赖。
- `implementation-plan.md`: 在阶段 10.18 下增加“开场白 v8 校准”子步骤，并在本地门完成前保持未完成。
- `progress.md`: 只记录实际完成的本地任务和测试命令；真实模型评测与部署仍写为未开始。
- `architecture.md`: 解释 `greeting-match-plan.ts`、`greeting-calibration.js`、一次调用、证据层级和跨平台失败策略。

- [ ] **Step 4: Scan the repository for stale v7 rules**

Run:

```bash
rg -n "experience-friendly-compact-v7|恰好3段|恰好三段|230.?450|300.?450|期待得到您的回复|第一段必须以.您好" shared cloudfunctions tests docs memory-bank
```

Expected: only explicitly labeled historical records may match. Every current rule, test and upload instruction must reference v8, 350–450 and 3–4 paragraphs.

- [ ] **Step 5: Run the full local gate**

Run:

```bash
npm run check
```

Expected: format, fixtures, sensitive-data scan, type checking, all Vitest suites and five TypeScript builds exit 0. This command must not call OCR, TokenHub or CloudBase.

- [ ] **Step 6: Review the exact diff and excluded local files**

Run:

```bash
git status --short
git diff --check
git diff --name-only
```

Expected: no whitespace errors; `project.config.json` and `project.private.config.json` remain unstaged; no `.env*`, raw resume/JD, generated greeting, key or identity file appears in the planned commit.

- [ ] **Step 7: Commit documentation and final local parity**

```bash
git add docs/phase-10/greeting-quality-calibration.md docs/phase-10/experience-version-upload-guide.md memory-bank/design-document.md memory-bank/tech-stack.md memory-bank/implementation-plan.md memory-bank/progress.md memory-bank/architecture.md
git commit -m "docs: record greeting v8 calibration"
```

### Task 9: Run Authorized Real-Model Evaluation and Deploy Only After Approval

**Files:**
- Create after authorized evaluation: `docs/phase-10/greeting-v8-live-evaluation.md`
- Modify after product-owner acceptance: `memory-bank/progress.md`
- Modify after product-owner acceptance: `memory-bank/implementation-plan.md`
- Modify after product-owner acceptance: `memory-bank/architecture.md`

- [ ] **Step 1: Stop and request explicit authorization**

Do not continue until the product owner separately authorizes both real TokenHub evaluation and worker deployment. The approval must occur after Task 8 reports a clean `npm run check`.

- [ ] **Step 2: Verify the zero-cost preflight without exposing credentials**

Confirm in the Tencent consoles:

- CloudBase overage billing is off.
- OCR postpaid billing is off.
- TokenHub token billing is off and remaining free quota is sufficient for three generation calls.
- Tencent Cloud actual bill remains 0 CNY.
- `worker` retains existing `TOKENHUB_API_KEY`, OCR credentials and `CLOUDBASE_APIKEY`; no value is copied into terminal output, screenshots or repository files.

Expected: all five checks pass. If any check fails, stop before deployment or model calls.

- [ ] **Step 3: Deploy only the worker**

Run from the repository root:

```bash
npx tcb fn deploy worker --force
```

Expected: deployment completes for `applymate-mvp-d0g005nnw103af4c3`; `api` and `cleanup` are unchanged.

- [ ] **Step 4: Verify worker health and disclosure**

In the WeChat Developer Tools Console, run:

```js
wx.cloud.callFunction({ name: "worker", data: { healthcheck: true } })
  .then(({ result }) => console.log({
    state: result?.data?.state,
    acceptsUserTraffic: result?.data?.acceptsUserTraffic,
  }))
```

Expected:

```js
{ state: "experience_real_ai_live", acceptsUserTraffic: true }
```

- [ ] **Step 5: Run the three product-owner cases through the actual experience build**

For strategic investment, financial AI Agent product, and SEO, use the product owner’s already confirmed private inputs on the device. Do not write those inputs or outputs into the repository. For each case record only:

- case ID: `investment`, `financial_ai_agent`, or `seo`;
- visible character count and paragraph count;
- `processingMetrics.modelDurationMs` and `processingMetrics.totalDurationMs`;
- detected `matchMode`;
- five rubric scores;
- hard-failure label or `none`.

Expected: all three have no hard failure, score at least 85/100, 350–450 visible characters, 3–4 paragraphs, total device time below 20 seconds, and median device time at most 12 seconds.

- [ ] **Step 6: Write the non-content evaluation report only after all measurements exist**

After Step 5 has produced three complete measurement records, create
`docs/phase-10/greeting-v8-live-evaluation.md`. The report must contain:

- the heading `Greeting v8 Live Evaluation`;
- Prompt version `experience-evidence-planned-v8`;
- model calls per generation, which must equal `1`;
- billing preflight result and the actual post-evaluation Tencent Cloud charge;
- one row each for `investment`, `financial_ai_agent`, and `seo`;
- columns for match mode, score, visible characters, paragraph count,
  `processingMetrics.modelDurationMs`, `processingMetrics.totalDurationMs`, and hard-failure label;
- a note that real resume facts, JD text, model output, OpenID, file ID and RequestId are excluded.

Do not create or commit the report while any metric is unknown. Before committing,
run this structural check:

```bash
node -e 'const fs=require("node:fs");const p="docs/phase-10/greeting-v8-live-evaluation.md";const s=fs.readFileSync(p,"utf8");for(const id of ["investment","financial_ai_agent","seo"]){const row=s.split(/\r?\n/u).find((line)=>new RegExp(`^\\|\\s*${id}\\s*\\|`).test(line));if(!row)throw new Error(`missing ${id}`);const cells=row.split("|").slice(1,-1).map((cell)=>cell.trim());if(cells.length!==8||[2,3,4,5,6].some((index)=>!Number.isFinite(Number(cells[index]))))throw new Error(`incomplete ${id}`)}if(/unknown|待补|示例值/u.test(s))throw new Error("incomplete live evaluation report")'
```

Expected: exit 0. If any case fails, record its safe failure label, leave stage
10.18 incomplete, and do not describe v8 as accepted.

- [ ] **Step 7: Obtain explicit product-owner acceptance**

The product owner must confirm both text quality and device timing. Automatic tests and local synthetic gold cases do not replace this approval.

- [ ] **Step 8: Mark the milestone only after acceptance and rerun checks**

Update `memory-bank/progress.md`, `memory-bank/implementation-plan.md` and `memory-bank/architecture.md` with the actual deployment version, metrics-only evaluation result and acceptance time. Then run:

```bash
npm run check
git diff --check
```

Expected: both commands exit 0.

- [ ] **Step 9: Commit only the evaluation evidence and milestone documents**

```bash
git add docs/phase-10/greeting-v8-live-evaluation.md memory-bank/progress.md memory-bank/implementation-plan.md memory-bank/architecture.md
git commit -m "feat: complete greeting v8 calibration"
```

Stage 10 remains subject to its other release gates. Completing this plan does not authorize public release, formal review submission, paid fallback, or a second model call.
