import { describe, expect, it } from "vitest";

import { syntheticGreetingCalibrationCases } from "../helpers/synthetic-greeting-calibration-cases.js";

type Fact = { factId: string; sourceType: string; text: string };
type JdField = { fieldId: string; text: string };
type JobDescription = {
  companyName?: JdField;
  jobTitle?: JdField;
  responsibilities: JdField[];
  hardSkills: JdField[];
  experienceEducation: JdField[];
  locationWorkMode: JdField[];
  availabilityDuration: JdField[];
};
type Match = {
  fact: Fact;
  requirement: JdField & { requirementIndex: number; requirementType: string };
};
type EvidenceSource =
  | { type: "fact"; factId: string }
  | { type: "jd"; fieldId: string };
type GreetingEvidence = {
  claimId: string;
  text: string;
  sources: EvidenceSource[];
};
type GreetingPlan = Record<string, unknown> & {
  directFactIds: string[];
  matchMode: "strong" | "partial" | "low";
  paragraphs: string[];
  transferableEvidence: Array<{ factId: string }>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildFactMatches,
  buildJdSnapshot,
  classifyRoleFamily,
  modelGreetingPackage,
  rankFactsForText,
} = require("../../cloudfunctions/worker/deploy/experience-worker.js") as {
  buildFactMatches(
    selection: GreetingPlan,
    jd: JobDescription,
    facts: Fact[],
  ): Match[];
  buildJdSnapshot(input: unknown): JobDescription;
  classifyRoleFamily(text: string): string;
  modelGreetingPackage(
    selection: GreetingPlan,
    jd: JobDescription,
    matches: Match[],
    facts: Fact[],
  ): { body: string; evidence: GreetingEvidence[] };
  rankFactsForText(facts: readonly Fact[], text: string): Fact[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizeGreetingPlan } = require(
  "../../cloudfunctions/worker/deploy/greeting-calibration.js",
) as {
  normalizeGreetingPlan(
    input: unknown,
    context: { facts: Fact[]; jd: JobDescription; rawJdText: string },
  ): GreetingPlan;
};

function evaluateOutput(
  calibrationCase: (typeof syntheticGreetingCalibrationCases)[keyof typeof syntheticGreetingCalibrationCases],
  modelOutput: Record<string, unknown>,
  jdInput: unknown = modelOutput,
) {
  const facts = calibrationCase.facts.map((fact) => ({ ...fact }));
  const jd = buildJdSnapshot(jdInput);
  const plan = normalizeGreetingPlan(modelOutput, {
    facts,
    jd,
    rawJdText: calibrationCase.jd,
  });
  return {
    jd,
    plan,
    result: modelGreetingPackage(
      plan,
      jd,
      buildFactMatches(plan, jd, facts),
      facts,
    ),
  };
}

function mutateParagraph(
  paragraphs: string[],
  index: number,
  mutate: (paragraph: string) => string,
) {
  const paragraph = paragraphs[index];
  if (paragraph === undefined) {
    throw new Error(`Synthetic fixture paragraph ${index} is missing.`);
  }
  paragraphs[index] = mutate(paragraph);
}

function runInvalidSyntheticMutation(
  mutation:
    | "job_title_mismatch"
    | "unsourced_number"
    | "cross_jd_domain_term"
    | "transferable_as_direct",
) {
  if (mutation === "job_title_mismatch") {
    const calibrationCase = syntheticGreetingCalibrationCases.investment;
    const modelOutput = structuredClone(
      calibrationCase.modelOutput,
    ) as Record<string, unknown>;
    modelOutput.jobTitle = "市场营销实习生";
    return evaluateOutput(
      calibrationCase,
      modelOutput,
      calibrationCase.modelOutput,
    );
  }
  if (mutation === "unsourced_number") {
    const calibrationCase = syntheticGreetingCalibrationCases.investment;
    const modelOutput = structuredClone(
      calibrationCase.modelOutput,
    ) as Record<string, unknown> & {
      paragraphs: string[];
    };
    mutateParagraph(
      modelOutput.paragraphs,
      1,
      (paragraph) => paragraph.replace("完整投资研究", "99次完整投资研究"),
    );
    return evaluateOutput(calibrationCase, modelOutput);
  }
  if (mutation === "cross_jd_domain_term") {
    const calibrationCase = syntheticGreetingCalibrationCases.financialAiAgent;
    const modelOutput = structuredClone(
      calibrationCase.modelOutput,
    ) as Record<string, unknown> & {
      paragraphs: string[];
    };
    mutateParagraph(modelOutput.paragraphs, 1, (paragraph) =>
      paragraph.replace("模型评测", "投研知识库与研报提取"),
    );
    return evaluateOutput(calibrationCase, modelOutput);
  }
  const calibrationCase = syntheticGreetingCalibrationCases.seo;
  const modelOutput = structuredClone(
    calibrationCase.modelOutput,
  ) as Record<string, unknown> & {
    paragraphs: string[];
  };
  mutateParagraph(
    modelOutput.paragraphs,
    1,
    (paragraph) => `${paragraph}我独立负责过完整SEO策略。`,
  );
  return evaluateOutput(calibrationCase, modelOutput);
}

function expectRequiredWording(
  body: string,
  phrase: string,
  matchMode: "strong" | "partial" | "low",
) {
  if (phrase === "迁移") {
    expect(matchMode).toBe("partial");
    expect(body).toMatch(/(?:可以|能够|可)[^。！？]{0,24}迁移/iu);
    expect(body).not.toMatch(/(?:没有|缺少|不足|不完全匹配)/iu);
    return;
  }
  expect(body.replace(/\s+/gu, "")).toContain(phrase.replace(/\s+/gu, ""));
}

type ParagraphSourceExpectation = {
  factIds: string[];
  jdFieldIds: string[];
};

function requiredFieldId(field: JdField | undefined, label: string): string {
  if (!field) throw new Error(`Synthetic JD field ${label} is missing.`);
  return field.fieldId;
}

function expectedParagraphSources(
  caseId: keyof typeof syntheticGreetingCalibrationCases,
  jd: JobDescription,
): ParagraphSourceExpectation[] {
  const jobTitle = requiredFieldId(jd.jobTitle, "jobTitle");
  const companyName = requiredFieldId(jd.companyName, "companyName");
  if (caseId === "investment") {
    const hardSkill = requiredFieldId(jd.hardSkills[0], "hardSkills[0]");
    return [
      {
        factIds: ["fact_school"],
        jdFieldIds: [
          jobTitle,
          companyName,
          requiredFieldId(jd.experienceEducation[0], "experienceEducation[0]"),
        ],
      },
      { factIds: ["fact_investment"], jdFieldIds: [hardSkill] },
      { factIds: ["fact_equity"], jdFieldIds: [hardSkill] },
      {
        factIds: ["fact_investment", "fact_availability"],
        jdFieldIds: [
          hardSkill,
          requiredFieldId(jd.availabilityDuration[0], "availabilityDuration[0]"),
        ],
      },
    ];
  }
  if (caseId === "financialAiAgent") {
    const responsibility0 = requiredFieldId(
      jd.responsibilities[0],
      "responsibilities[0]",
    );
    const hardSkill1 = requiredFieldId(jd.hardSkills[1], "hardSkills[1]");
    const education = requiredFieldId(
      jd.experienceEducation[0],
      "experienceEducation[0]",
    );
    return [
      {
        factIds: ["fact_product", "fact_fintech"],
        jdFieldIds: [jobTitle, companyName, hardSkill1, education],
      },
      { factIds: ["fact_eval"], jdFieldIds: [responsibility0] },
      { factIds: ["fact_product"], jdFieldIds: [hardSkill1] },
      {
        factIds: ["fact_eval"],
        jdFieldIds: [
          responsibility0,
          requiredFieldId(jd.responsibilities[1], "responsibilities[1]"),
          requiredFieldId(jd.responsibilities[2], "responsibilities[2]"),
        ],
      },
    ];
  }
  const hardSkill0 = requiredFieldId(jd.hardSkills[0], "hardSkills[0]");
  const hardSkill1 = requiredFieldId(jd.hardSkills[1], "hardSkills[1]");
  return [
    {
      factIds: ["fact_web"],
      jdFieldIds: [jobTitle, companyName, hardSkill0],
    },
    { factIds: ["fact_web"], jdFieldIds: [hardSkill0] },
    {
      factIds: ["fact_data", "fact_iteration"],
      jdFieldIds: [
        hardSkill0,
        hardSkill1,
        requiredFieldId(jd.responsibilities[1], "responsibilities[1]"),
      ],
    },
    {
      factIds: ["fact_iteration", "fact_english"],
      jdFieldIds: [hardSkill1, hardSkill0],
    },
  ];
}

function expectGoldEvidence(
  caseId: keyof typeof syntheticGreetingCalibrationCases,
  facts: readonly Fact[],
  jd: JobDescription,
  paragraphs: readonly string[],
  evidence: readonly GreetingEvidence[],
) {
  const expected = expectedParagraphSources(caseId, jd);
  const allowedFactIds = new Set(facts.map(({ factId }) => factId));
  const allowedJdFieldIds = new Set([
    ...(jd.jobTitle ? [jd.jobTitle.fieldId] : []),
    ...(jd.companyName ? [jd.companyName.fieldId] : []),
    ...jd.responsibilities.map(({ fieldId }) => fieldId),
    ...jd.hardSkills.map(({ fieldId }) => fieldId),
    ...jd.experienceEducation.map(({ fieldId }) => fieldId),
    ...jd.locationWorkMode.map(({ fieldId }) => fieldId),
    ...jd.availabilityDuration.map(({ fieldId }) => fieldId),
  ]);

  expect(evidence).toHaveLength(paragraphs.length);
  expect(evidence).toHaveLength(expected.length);
  evidence.forEach((claim, paragraphIndex) => {
    const paragraphExpectation = expected[paragraphIndex];
    if (!paragraphExpectation) {
      throw new Error(`Missing evidence expectation for paragraph ${paragraphIndex}.`);
    }
    expect(claim.claimId).toBe(`claim_match_${paragraphIndex + 1}`);
    expect(claim.text).toBe(paragraphs[paragraphIndex]);
    expect(claim.sources.length).toBeGreaterThan(0);

    const sourceKeys = claim.sources.map((source) =>
      source.type === "fact" ? `fact:${source.factId}` : `jd:${source.fieldId}`,
    );
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
    for (const source of claim.sources) {
      if (source.type === "fact") expect(allowedFactIds.has(source.factId)).toBe(true);
      else expect(allowedJdFieldIds.has(source.fieldId)).toBe(true);
    }

    const factIds = claim.sources.flatMap((source) =>
      source.type === "fact" ? [source.factId] : [],
    );
    const jdFieldIds = claim.sources.flatMap((source) =>
      source.type === "jd" ? [source.fieldId] : [],
    );
    expect(factIds.sort()).toEqual([...paragraphExpectation.factIds].sort());
    expect(jdFieldIds.sort()).toEqual([...paragraphExpectation.jdFieldIds].sort());
  });
}

describe("greeting calibration gold cases", () => {
  it.each(Object.entries(syntheticGreetingCalibrationCases))(
    "%s keeps the confirmed role, evidence priority, and wording strength",
    (_caseId, calibrationCase) => {
      const { jd, plan, result } = evaluateOutput(
        calibrationCase,
        calibrationCase.modelOutput,
      );

      expect(classifyRoleFamily(calibrationCase.jd)).toBe(
        calibrationCase.expectedFamily,
      );
      expect(
        rankFactsForText(calibrationCase.facts, calibrationCase.jd)[0]?.factId,
      ).toBe(calibrationCase.expectedFirstFactId);
      expect(plan.matchMode).toBe(calibrationCase.expected.matchMode);
      expect(plan.directFactIds).toEqual(
        calibrationCase.expected.directFactIds,
      );
      expect(plan.transferableEvidence.map(({ factId }) => factId)).toEqual(
        calibrationCase.expected.transferableFactIds,
      );
      const visibleLength = result.body.replace(/\s+/gu, "").length;
      const range = plan.matchMode === "strong"
        ? { minimum: 550, maximum: 800, paragraphMinimum: 4, paragraphMaximum: 5 }
        : plan.matchMode === "partial"
          ? { minimum: 350, maximum: 550, paragraphMinimum: 3, paragraphMaximum: 4 }
          : { minimum: 180, maximum: 350, paragraphMinimum: 2, paragraphMaximum: 3 };
      expect(visibleLength).toBeGreaterThanOrEqual(range.minimum);
      expect(visibleLength).toBeLessThanOrEqual(range.maximum);
      expect(plan.paragraphs.length).toBeGreaterThanOrEqual(range.paragraphMinimum);
      expect(plan.paragraphs.length).toBeLessThanOrEqual(range.paragraphMaximum);
      for (const phrase of calibrationCase.expected.requiredPhrases) {
        expectRequiredWording(result.body, phrase, plan.matchMode);
      }
      for (const phrase of calibrationCase.expected.forbiddenPhrases) {
        expect(result.body).not.toContain(phrase);
      }
      expectGoldEvidence(
        _caseId as keyof typeof syntheticGreetingCalibrationCases,
        calibrationCase.facts,
        jd,
        plan.paragraphs,
        result.evidence,
      );
    },
  );

  it.each([
    ["unsourced_number", "greeting_numeric_source"],
    ["cross_jd_domain_term", "cross_jd_domain_term"],
    ["transferable_as_direct", "greeting_evidence_alignment"],
  ] as const)("rejects the %s mutation at %s", (mutation, expectedGate) => {
    let failure: (Error & { validationGate?: string }) | undefined;
    try {
      runInvalidSyntheticMutation(mutation);
    } catch (error) {
      failure = error as Error & { validationGate?: string };
    }
    expect(failure).toMatchObject({
      message: "MODEL_INVALID_OUTPUT",
      validationGate: expectedGate,
    });
  });

  it("replaces a mismatched model job title with the trusted current-JD title", () => {
    const evaluated = runInvalidSyntheticMutation("job_title_mismatch");
    expect(evaluated.plan.jobTitle).toBe("战略投资实习生");
    expect(evaluated.result.body).not.toContain("市场营销实习生");
  });
});
