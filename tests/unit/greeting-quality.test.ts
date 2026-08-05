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
  let second = "我重视真实沟通，也会主动复盘结果，希望把学习能力转化为稳定交付。";
  while (countVisibleCharacters(`${first}\n${second}`) < 260) {
    second += "我愿意从基础工作做起，及时同步进展，并认真吸收团队反馈。";
  }

  return {
    body: `${first}\n${second}`,
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

const registry = {
  factIds: new Set([factId]),
  jdFieldIds: new Set([jdFieldId]),
};

describe("AI greeting quality gate", () => {
  it("accepts a compliant simplified-Chinese draft", () => {
    const draft = validDraft();

    expect(countVisibleCharacters(draft.body)).toBeGreaterThanOrEqual(250);
    expect(countVisibleCharacters(draft.body)).toBeLessThanOrEqual(350);
    expect(validateAiGreeting(draft, registry)).toEqual({ valid: true, errors: [] });
  });

  it("rejects short and long bodies", () => {
    expect(
      validateAiGreeting({ ...validDraft(), body: "您好\n谢谢" }, registry).errors,
    ).toContain("BODY_LENGTH_INVALID");
    expect(
      validateAiGreeting(
        {
          ...validDraft(),
          body: `${"字".repeat(176)}\n${"字".repeat(175)}`,
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
