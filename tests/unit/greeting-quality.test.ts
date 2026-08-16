import { describe, expect, it } from "vitest";

import {
  countVisibleCharacters,
  validateAiGreeting,
} from "../../shared/src/index.js";

const factId = "fact_1234567890abcdef12345678";
const jdFieldId = "jd_job_title";

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
