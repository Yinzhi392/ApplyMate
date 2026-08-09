import { describe, expect, it } from "vitest";

import {
  JobDescriptionSchema,
  evaluateJobDescription,
} from "../../shared/src/index.js";

const title = {
  fieldId: "jd_job_title",
  text: "产品实习生",
  confidence: 0.98,
};

const baseJob = {
  jobTitle: title,
  companyName: {
    fieldId: "jd_company_name",
    text: "示例科技",
    confidence: 0.9,
  },
  responsibilities: [],
  hardSkills: [],
  experienceEducation: [],
  locationWorkMode: [],
  availabilityDuration: [],
};

describe("JobDescription schema and direct generation readiness", () => {
  it("uses a generic role fallback instead of waiting when the title is missing", () => {
    const { jobTitle: _jobTitle, ...withoutTitle } = baseJob;
    const result = evaluateJobDescription({
      ...withoutTitle,
      responsibilities: [{ fieldId: "jd_responsibility_1", text: "整理产品需求", confidence: 0.95 }],
    });

    expect(result.status).toBe("ready");
    expect(result.jobDescription.jobTitle?.text).toBe("该岗位");
    expect(result.warnings).toContain("JOB_TITLE_MISSING");
  });

  it("omits low-confidence fields and continues with reliable content", () => {
    const result = evaluateJobDescription({
      ...baseJob,
      responsibilities: [{ fieldId: "jd_responsibility_1", text: "整理产品需求", confidence: 0.95 }],
      hardSkills: [
        { fieldId: "jd_hard_skill_1", text: "SQL", confidence: 0.79 },
      ],
    });

    expect(result.status).toBe("ready");
    expect(result.jobDescription.hardSkills).toEqual([]);
    expect(result.omittedFieldIds).toEqual(["jd_hard_skill_1"]);
    expect(result.warnings).toContain("LOW_CONFIDENCE_FIELD_OMITTED");
  });

  it("allows a missing company and uses the approved fallback warning", () => {
    const { companyName: _companyName, ...withoutCompany } = baseJob;
    const parsed = JobDescriptionSchema.parse({
      ...withoutCompany,
      responsibilities: [{ fieldId: "jd_responsibility_1", text: "整理产品需求", confidence: 0.95 }],
    });
    const result = evaluateJobDescription(parsed);

    expect(result.status).toBe("ready");
    expect(result.companyDisplayName).toBe("贵司");
    expect(result.warnings).toContain("COMPANY_NAME_MISSING");
  });

  it("fails when no reliable responsibility or requirement remains", () => {
    const result = evaluateJobDescription(baseJob);

    expect(result.status).toBe("insufficient_content");
    expect(result.warnings).toContain("JD_CONTENT_INSUFFICIENT");
  });

  it("rejects invalid confidence and duplicate field IDs", () => {
    expect(
      JobDescriptionSchema.safeParse({
        ...baseJob,
        hardSkills: [
          { fieldId: "jd_job_title", text: "SQL", confidence: 1.1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      JobDescriptionSchema.safeParse({
        ...baseJob,
        hardSkills: [
          { fieldId: "jd_job_title", text: "SQL", confidence: 0.9 },
        ],
      }).success,
    ).toBe(false);
  });
});
