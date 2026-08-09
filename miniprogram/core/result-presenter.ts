interface FactSnapshot {
  factId: string;
  sourceType: string;
  text: string;
}

interface JobField {
  fieldId: string;
  text: string;
  confidence: number;
}

interface JobDescriptionSnapshot {
  jobTitle?: JobField;
  companyName?: JobField;
  responsibilities: JobField[];
  hardSkills: JobField[];
  experienceEducation: JobField[];
  locationWorkMode: JobField[];
  availabilityDuration: JobField[];
}

type EvidenceSource =
  | { type: "fact"; factId: string }
  | { type: "jd"; fieldId: string };

interface ResultInput {
  applicationId: string;
  greetingBody: string;
  status: "not_applied" | "applied";
  memo: string;
  warnings: string[];
  omittedRequirements: string[];
  factSnapshot: FactSnapshot[];
  jdSnapshot: JobDescriptionSnapshot;
  evidence: Array<{ claimId: string; text: string; sources: EvidenceSource[] }>;
  copyText: string;
  manualWarnings: Array<{ code?: string; message?: string }>;
}

const FACT_LABELS: Record<string, string> = {
  education: "教育",
  experience: "经历",
  project: "项目",
  skill: "技能",
  language: "语言",
  certificate: "证书",
  achievement: "成果",
  preference: "偏好",
  other: "其他",
};

const WARNING_MESSAGES: Record<string, string> = {
  COMPANY_NAME_MISSING: "未识别到公司名，正文已使用“贵司”。",
  JOB_TITLE_MISSING: "未可靠识别岗位名，正文已使用“该岗位”。",
  LOW_CONFIDENCE_FIELD_OMITTED: "部分低置信岗位字段已省略，请核对结果。",
  LOW_CONFIDENCE_FIELD: "部分低置信岗位字段已省略，请核对结果。",
  JOB_TITLE_REQUIRED: "未可靠识别岗位名，正文已使用“该岗位”。",
};

function jobFields(jobDescription: JobDescriptionSnapshot): JobField[] {
  return [
    jobDescription.jobTitle,
    jobDescription.companyName,
    ...jobDescription.responsibilities,
    ...jobDescription.hardSkills,
    ...jobDescription.experienceEducation,
    ...jobDescription.locationWorkMode,
    ...jobDescription.availabilityDuration,
  ].filter((field): field is JobField => field !== undefined);
}

export function createResultView(input: ResultInput): ResultInput & {
  companyDisplayName: string;
  jobTitle: string;
  claims: Array<{ claimId: string; text: string; sourceLabels: string[] }>;
  warningMessages: string[];
} {
  const facts = new Map(input.factSnapshot.map((fact) => [fact.factId, fact]));
  const fields = new Map(jobFields(input.jdSnapshot).map((field) => [field.fieldId, field]));

  return {
    ...input,
    companyDisplayName: input.jdSnapshot.companyName?.text ?? "贵司",
    jobTitle: input.jdSnapshot.jobTitle?.text ?? "该岗位",
    claims: input.evidence.map((claim) => ({
      claimId: claim.claimId,
      text: claim.text,
      sourceLabels: claim.sources.map((source) => {
        if (source.type === "fact") {
          const fact = facts.get(source.factId);
          return fact === undefined
            ? "来源待核对"
            : `${FACT_LABELS[fact.sourceType] ?? "事实"}：${fact.text}`;
        }
        const field = fields.get(source.fieldId);
        return field === undefined ? "来源待核对" : `岗位：${field.text}`;
      }),
    })),
    warningMessages: input.warnings.map(
      (warning) => WARNING_MESSAGES[warning] ?? warning,
    ),
  };
}
