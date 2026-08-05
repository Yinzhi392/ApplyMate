import { describe, expect, it, vi } from "vitest";

import { ResumeStructureParser } from "../../cloudfunctions/worker/src/index.js";
import { ResumeProfileSchema } from "../../shared/src/index.js";

const STRUCTURED_RESUME = {
  name: "林同学",
  education: [
    {
      school: "合成大学",
      major: "信息管理",
      degree: "本科",
      startDate: "2022-09",
      endDate: "2026-06",
      text: "合成大学信息管理专业本科，2022年9月至2026年6月",
    },
  ],
  experiences: [
    {
      organization: "示例科技",
      role: "产品实习生",
      startDate: "2025-01",
      endDate: "2025-06",
      text: "在示例科技担任产品实习生，独立完成用户调研",
    },
  ],
  projects: [],
  skills: [{ name: "SQL", text: "能够使用SQL完成数据分析" }],
  languages: [],
  certificates: [],
  achievements: [],
  otherFacts: [],
};

function provider(value: unknown) {
  return { parseStructuredResume: vi.fn(async () => value) };
}

describe("ResumeStructureParser", () => {
  it("creates a valid unconfirmed profile with stable fact identifiers", async () => {
    const first = new ResumeStructureParser(provider(STRUCTURED_RESUME));
    const second = new ResumeStructureParser(
      provider(JSON.stringify(STRUCTURED_RESUME)),
    );

    const firstProfile = await first.parse(
      "已脱敏简历",
      "resume_stable_01",
    );
    const secondProfile = await second.parse(
      "同一份已脱敏简历",
      "resume_stable_02",
    );

    expect(ResumeProfileSchema.safeParse(firstProfile).success).toBe(true);
    expect(firstProfile.confirmed).toBe(false);
    expect(firstProfile.education[0]?.factId).toBe(
      secondProfile.education[0]?.factId,
    );
    expect(firstProfile.experiences[0]?.factHash).toBe(
      secondProfile.experiences[0]?.factHash,
    );
    expect(firstProfile.skills[0]?.factId).toMatch(/^fact_[a-f0-9]{24}$/u);
  });

  it("uses the fallback once for invalid JSON, truncation, or invalid schema", async () => {
    for (const invalid of [
      "{\"name\":\"truncated",
      { ...STRUCTURED_RESUME, skills: [{ name: "SQL" }] },
      "not-json",
    ]) {
      const primary = provider(invalid);
      const fallback = provider(STRUCTURED_RESUME);
      const parser = new ResumeStructureParser(primary, fallback);

      await expect(
        parser.parse("已脱敏简历", "resume_fallback_01"),
      ).resolves.toMatchObject({ confirmed: false, name: "林同学" });
      expect(primary.parseStructuredResume).toHaveBeenCalledTimes(1);
      expect(fallback.parseStructuredResume).toHaveBeenCalledTimes(1);
    }
  });

  it("returns stable processing errors when both model outputs fail", async () => {
    const invalid = new ResumeStructureParser(
      provider("bad-json"),
      provider({ wrong: true }),
    );
    await expect(
      invalid.parse("已脱敏简历", "resume_invalid_01"),
    ).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT",
      retryable: false,
    });

    const failed = new ResumeStructureParser(
      { parseStructuredResume: async () => Promise.reject(new Error("down")) },
      { parseStructuredResume: async () => Promise.reject(new Error("down")) },
    );
    await expect(
      failed.parse("已脱敏简历", "resume_failed_01"),
    ).rejects.toMatchObject({
      code: "MODEL_FAILED",
      retryable: true,
    });
  });
});
