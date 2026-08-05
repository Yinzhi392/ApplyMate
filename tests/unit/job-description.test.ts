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

describe("JobDescription schema and readiness", () => {
  it("waits for confirmation when the required job title is missing", () => {
    const { jobTitle: _jobTitle, ...withoutTitle } = baseJob;
    const result = evaluateJobDescription(withoutTitle);

    expect(result.status).toBe("awaiting_user_confirmation");
    expect(result.warnings).toContain("JOB_TITLE_REQUIRED");
  });

  it("waits when a present critical field has low confidence", () => {
    const result = evaluateJobDescription({
      ...baseJob,
      hardSkills: [
        { fieldId: "jd_hard_skill_1", text: "SQL", confidence: 0.79 },
      ],
    });

    expect(result.status).toBe("awaiting_user_confirmation");
    expect(result.confirmFieldIds).toEqual(["jd_hard_skill_1"]);
  });

  it("allows a missing company and uses the approved fallback warning", () => {
    const { companyName: _companyName, ...withoutCompany } = baseJob;
    const parsed = JobDescriptionSchema.parse(withoutCompany);
    const result = evaluateJobDescription(parsed);

    expect(result.status).toBe("ready");
    expect(result.companyDisplayName).toBe("贵司");
    expect(result.warnings).toContain("COMPANY_NAME_MISSING");
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
