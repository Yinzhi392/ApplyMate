import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createResultView } from "../../miniprogram/core/result-presenter.js";

const fixture = readFileSync(
  join(process.cwd(), "tests/fixtures/phase-0-cases.md"),
  "utf8",
);
const caseIds = Array.from(fixture.matchAll(/^## (C\d{2})｜/gmu), (match) => match[1]);

describe("mini-program result fixture rendering", () => {
  it("renders all 30 approved fixture cases without missing evidence labels", () => {
    expect(caseIds).toHaveLength(30);

    caseIds.forEach((caseId, index) => {
      const factId = `fact_${caseId}`;
      const fieldId = `jd_${caseId}`;
      const missingCompany = index % 5 === 0;
      const view = createResultView({
        applicationId: `application_${caseId}`,
        copyText: `测试正文 ${caseId}\nAI生成内容，请核对真实性`,
        evidence: [{
          claimId: `claim_${caseId}`,
          sources: [
            { type: "fact", factId },
            { type: "jd", fieldId },
          ],
          text: `可验证匹配点 ${caseId}`,
        }],
        factSnapshot: [{ factId, sourceType: "project", text: `脱敏项目事实 ${caseId}` }],
        greetingBody: `测试正文 ${caseId}`,
        jdSnapshot: {
          availabilityDuration: [],
          ...(missingCompany
            ? {}
            : { companyName: { confidence: 0.9, fieldId: `company_${caseId}`, text: `示例公司 ${caseId}` } }),
          experienceEducation: [],
          hardSkills: [],
          jobTitle: { confidence: 0.95, fieldId, text: `示例岗位 ${caseId}` },
          locationWorkMode: [],
          responsibilities: [],
        },
        manualWarnings: index % 4 === 0
          ? [{ code: "LENGTH_OUT_OF_RANGE", message: "手动正文长度需核对。" }]
          : [],
        memo: "",
        omittedRequirements: index % 3 === 0 ? ["未具备的优先技能"] : [],
        status: index % 2 === 0 ? "not_applied" : "applied",
        warnings: missingCompany ? ["COMPANY_NAME_MISSING"] : [],
      });

      expect(view.applicationId).toBe(`application_${caseId}`);
      expect(view.claims).toEqual([
        expect.objectContaining({
          sourceLabels: [
            `项目：脱敏项目事实 ${caseId}`,
            `岗位：示例岗位 ${caseId}`,
          ],
        }),
      ]);
      expect(view.companyDisplayName).toBe(missingCompany ? "贵司" : `示例公司 ${caseId}`);
    });
  });
});
