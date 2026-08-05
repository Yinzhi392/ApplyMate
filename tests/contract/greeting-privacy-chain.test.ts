import { describe, expect, it } from "vitest";

import {
  GreetingGenerationPipeline,
  GreetingModelGateway,
} from "../../cloudfunctions/worker/src/index.js";
import {
  createFactId,
  hashFactText,
  type GreetingDraft,
} from "../../shared/src/index.js";

const DRAFT: GreetingDraft = {
  body: "合成正文",
  claims: [
    {
      claimId: "claim_1",
      text: "合成正文",
      sources: [{ type: "jd", fieldId: "jd_job_title" }],
    },
  ],
  omittedRequirements: [],
  warnings: [],
};

describe("greeting privacy chain", () => {
  it("sends only masked text context for initial and correction calls", async () => {
    const externalInputs: string[] = [];
    const gateway = new GreetingModelGateway({
      modelId: "synthetic-model",
      generate: async (input) => {
        externalInputs.push(input);
        return DRAFT;
      },
    });
    const pipeline = new GreetingGenerationPipeline(gateway);
    const sensitiveFact = "电话13800138000，邮箱test@example.com";
    const record = {
      jobId: "job_privacy",
      userId: "user_privacy",
      resumeId: "resume_privacy",
      inputType: "images" as const,
      temporaryFileIds: ["file_generation_secret"],
      resumeSnapshot: {
        resumeId: "resume_privacy",
        education: [],
        experiences: [],
        projects: [],
        skills: [
          {
            factId: createFactId("skill", sensitiveFact),
            sourceType: "skill" as const,
            text: sensitiveFact,
            factHash: hashFactText(sensitiveFact),
            name: "联系方式不应外发",
          },
        ],
        languages: [],
        certificates: [],
        achievements: [],
        preferences: [],
        otherFacts: [],
        confirmed: true,
      },
      preferenceSnapshot: [],
      status: "generating" as const,
      extractedMaskedText: "岗位联系人 hr@example.com",
      jobDescription: {
        jobTitle: {
          fieldId: "jd_job_title",
          text: "产品实习生",
          confidence: 1,
        },
        responsibilities: [],
        hardSkills: [],
        experienceEducation: [],
        locationWorkMode: [],
        availabilityDuration: [],
      },
      createdAt: "2026-08-05T17:30:00.000Z",
      updatedAt: "2026-08-05T17:30:00.000Z",
    };
    const baseRequest = {
      companyDisplayName: "贵司",
      jobTitle: "产品实习生",
    };

    await pipeline.generate(record, { ...baseRequest, mode: "initial" });
    await pipeline.generate(record, {
      ...baseRequest,
      mode: "correction",
      previousDraft: {
        ...DRAFT,
        body: "错误草稿含电话13800138000",
      },
      qualityErrors: ["SENSITIVE_INFORMATION_PRESENT"],
    });

    expect(externalInputs).toHaveLength(2);
    for (const input of externalInputs) {
      expect(input).not.toContain("13800138000");
      expect(input).not.toContain("test@example.com");
      expect(input).not.toContain("hr@example.com");
      expect(input).not.toContain("file_generation_secret");
      expect(input).toContain("[MASKED:phone]");
    }
    expect(externalInputs[1]).toContain("correction");
    expect(externalInputs[1]).toContain("SENSITIVE_INFORMATION_PRESENT");
  });
});
