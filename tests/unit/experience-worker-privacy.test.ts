import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { maskProtectedText, renderGreeting } = require(
  "../../cloudfunctions/worker/deploy/experience-worker.js",
) as {
  maskProtectedText(value: string): string;
  renderGreeting(
    jd: {
      companyName?: { text: string };
      jobTitle?: { text: string };
      responsibilities: Array<{ text: string }>;
    },
    facts: Array<{ text: string }>,
  ): string;
};

describe("experience worker privacy and deterministic output", () => {
  it("masks protected contact details before TokenHub", () => {
    const masked = maskProtectedText(
      "手机 13800138000，邮箱 apply@example.com，身份证 110101199001011234。",
    );
    expect(masked).not.toContain("13800138000");
    expect(masked).not.toContain("apply@example.com");
    expect(masked).not.toContain("110101199001011234");
    expect(masked).toContain("[MASKED_PHONE]");
  });

  it("renders a 250 to 350 character two-paragraph greeting from facts", () => {
    const body = renderGreeting(
      {
        companyName: { text: "示例科技" },
        jobTitle: { text: "AI 产品实习生" },
        responsibilities: [{ text: "需求分析、用户研究和产品迭代" }],
      },
      [
        { text: "负责校园 AI 助手项目的需求梳理与原型设计" },
        { text: "参与用户访谈并整理反馈" },
        { text: "熟悉 Figma 和数据分析工具" },
      ],
    );
    const count = Array.from(body.replace(/\s/gu, "")).length;
    expect(count).toBeGreaterThanOrEqual(250);
    expect(count).toBeLessThanOrEqual(350);
    expect(body.split("\n")).toHaveLength(2);
  });
});
