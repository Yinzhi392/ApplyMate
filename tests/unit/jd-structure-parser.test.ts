import { describe, expect, it } from "vitest";

import { JdStructureParser } from "../../cloudfunctions/worker/src/index.js";

function jd(overrides: Record<string, unknown> = {}) {
  return {
    jobTitle: {
      fieldId: "jd_job_title",
      text: "产品实习生",
      confidence: 0.98,
    },
    companyName: {
      fieldId: "jd_company_name",
      text: "合成科技",
      confidence: 0.96,
    },
    responsibilities: [
      {
        fieldId: "jd_responsibility_1",
        text: "参与需求分析",
        confidence: 0.91,
      },
    ],
    hardSkills: [],
    experienceEducation: [],
    locationWorkMode: [],
    availabilityDuration: [],
    ...overrides,
  };
}

describe("JD structure parser", () => {
  it.each([
    ["Chinese", jd()],
    ["English", jd({ jobTitle: { fieldId: "jd_job_title", text: "Product Intern", confidence: 0.95 } })],
    ["missing company", jd({ companyName: undefined })],
    ["missing title", jd({ jobTitle: undefined })],
  ])("accepts a strict %s structure", async (_label, output) => {
    const parser = new JdStructureParser({
      parseJobDescription: async () => output,
    });

    await expect(parser.parse("synthetic JD")).resolves.toMatchObject(output);
  });

  it("rejects conflicting duplicate field IDs and uses one fallback", async () => {
    const conflict = jd({
      hardSkills: [
        {
          fieldId: "jd_responsibility_1",
          text: "掌握 SQL",
          confidence: 0.9,
        },
      ],
    });
    let fallbackCalls = 0;
    const parser = new JdStructureParser(
      { parseJobDescription: async () => JSON.stringify(conflict) },
      {
        parseJobDescription: async () => {
          fallbackCalls += 1;
          return jd();
        },
      },
    );

    await expect(parser.parse("synthetic JD")).resolves.toMatchObject({
      jobTitle: { text: "产品实习生" },
    });
    expect(fallbackCalls).toBe(1);
  });
});
