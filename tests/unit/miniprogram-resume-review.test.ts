import { describe, expect, it } from "vitest";

import { createResumeReview } from "../../miniprogram/core/resume-review.js";
import { createFactId, hashFactText, type ResumeProfile } from "../../shared/src/index.js";

function profile(): ResumeProfile {
  const educationText = "华南理工大学市场营销本科";
  const experienceText = "运营实习中负责内容排期";
  const projectText = "独立规划12期内容，互动率提升18%";
  const skillText = "熟悉 Excel 和 Figma";
  return {
    resumeId: "resume_review_01",
    education: [{
      factId: createFactId("education", educationText),
      factHash: hashFactText(educationText),
      school: "华南理工大学",
      sourceType: "education",
      text: educationText,
    }],
    experiences: [{
      factId: createFactId("experience", experienceText),
      factHash: hashFactText(experienceText),
      organization: "示例公司",
      role: "运营实习生",
      sourceType: "experience",
      text: experienceText,
    }],
    projects: [{
      factId: createFactId("project", projectText),
      factHash: hashFactText(projectText),
      name: "内容运营项目",
      sourceType: "project",
      text: projectText,
    }],
    skills: [{
      factId: createFactId("skill", skillText),
      factHash: hashFactText(skillText),
      name: "工具",
      sourceType: "skill",
      text: skillText,
    }],
    languages: [],
    certificates: [],
    achievements: [],
    preferences: [],
    otherFacts: [],
    confirmed: false,
  };
}

describe("resume review presenter", () => {
  it("ranks three evidence-backed strengths and exposes all seven baseline weights", () => {
    const review = createResumeReview(profile(), []);

    expect(review.strengths).toHaveLength(3);
    expect(review.strengths[0]).toMatchObject({ weight: 25 });
    expect(review.weights.map(({ weight }) => weight)).toEqual([25, 25, 20, 15, 8, 5, 2]);
    expect(review.weights.map(({ label }) => label)).toEqual(expect.arrayContaining([
      "相关实习 / 工作经历 💼",
      "相关项目与量化成果 🚀",
      "专业技能与工具 🛠️",
    ]));
    expect(review.weights.at(-1)?.label).toContain("GPA");
  });

  it("separates specifically flagged facts without exposing fact IDs in display copy", () => {
    const source = profile();
    const reviewFactId = source.education[0]?.factId ?? "";
    const review = createResumeReview(source, [reviewFactId]);

    expect(review.needsReview).toHaveLength(1);
    expect(review.needsReview[0]).toMatchObject({ needsReview: true, text: "华南理工大学市场营销本科" });
    expect(review.confirmedFacts.every(({ text }) => !text.includes("fact_"))).toBe(true);
    expect(review.confirmedFacts.map(({ label }) => label)).toEqual(expect.arrayContaining([
      "实习 / 工作经历 💼",
      "项目经历 🚀",
      "专业技能与工具 🛠️",
    ]));
  });
});
