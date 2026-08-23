import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeResumeModel, parseJson, parseResumeWithFallback } = require(
  "../../cloudfunctions/worker/deploy/experience-worker.js",
) as {
  normalizeResumeModel(value: unknown, resumeId: string): {
    education: Array<{ text: string }>;
    experiences: Array<{ text: string }>;
    projects: Array<{ text: string }>;
    skills: Array<{ text: string }>;
    languages: Array<{ text: string }>;
    certificates: Array<{ text: string }>;
    achievements: Array<{ text: string }>;
    otherFacts: Array<{ text: string }>;
  };
  parseJson(value: unknown): unknown;
  parseResumeWithFallback(rawText: string, resumeId: string, modelCall: () => Promise<unknown>): Promise<{
    profile: { otherFacts: Array<{ text: string }> };
    parsingMode: string;
    warning?: string;
  }>;
};

describe("experience worker resume normalization", () => {
  it("accepts safe partial model output and defaults omitted sections to empty arrays", () => {
    const profile = normalizeResumeModel(
      {
        name: "张同学",
        education: [{ school: "示例大学", major: "产品设计" }],
        projects: [{ name: "校园助手", description: "完成需求梳理和原型设计" }],
        skills: ["Figma", { name: "SQL" }],
      },
      "resume_12345678",
    );

    expect(profile.education[0]?.text).toContain("示例大学");
    expect(profile.projects[0]?.text).toBe("完成需求梳理和原型设计");
    expect(profile.skills.map((fact) => fact.text)).toEqual(["Figma", "SQL"]);
    expect(profile.experiences).toEqual([]);
    expect(profile.languages).toEqual([]);
    expect(profile.certificates).toEqual([]);
    expect(profile.achievements).toEqual([]);
    expect(profile.otherFacts).toEqual([]);
  });

  it("unwraps common profile containers and ignores empty entries", () => {
    const profile = normalizeResumeModel(
      { data: { experiences: [{ organization: "示例团队", role: "产品实习生" }, {}] } },
      "resume_12345678",
    );

    expect(profile.experiences).toHaveLength(1);
    expect(profile.experiences[0]?.text).toBe("示例团队，产品实习生");
  });

  it("extracts one JSON object from harmless surrounding model prose", () => {
    expect(parseJson('结果如下：\n{"skills":[{"text":"SQL"}]}\n请核对')).toEqual({
      skills: [{ text: "SQL" }],
    });
  });

  it("rejects output with no usable resume facts", () => {
    expect(() => normalizeResumeModel({ name: "张同学" }, "resume_12345678")).toThrow(
      "MODEL_INVALID_OUTPUT",
    );
  });

  it("returns a reviewable fact draft when the model request fails", async () => {
    const result = await parseResumeWithFallback(
      "莫纳什大学金融科技本科在读\n完成上市公司估值项目\n邮箱 student@example.com",
      "resume_12345678",
      async () => { throw new TypeError("fetch failed"); },
    );

    expect(result.parsingMode).toBe("verified_text_fallback");
    expect(result.warning).toBe("AI_PARSE_FALLBACK");
    expect(result.profile.otherFacts.map((fact) => fact.text)).toEqual([
      "莫纳什大学金融科技本科在读",
      "完成上市公司估值项目",
      "邮箱 [邮箱已遮盖]",
    ]);
  });
});
