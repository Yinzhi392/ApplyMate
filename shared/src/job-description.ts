import { z } from "zod";

import { countVisibleCharacters } from "./text.js";

export const JOB_FIELD_CONFIDENCE_THRESHOLD = 0.8;
export const COMPANY_NAME_FALLBACK = "贵司";
export const JOB_TITLE_FALLBACK = "该岗位";

export const JobFieldIdSchema = z
  .string()
  .regex(/^jd_[a-z][a-z0-9_]{2,63}$/u);

export const JobFieldSchema = z
  .object({
    fieldId: JobFieldIdSchema,
    text: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => countVisibleCharacters(value) <= 2_000,
        "JD field exceeds 2000 visible characters.",
      ),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const JobDescriptionObjectSchema = z
  .object({
    jobTitle: JobFieldSchema.optional(),
    companyName: JobFieldSchema.optional(),
    responsibilities: z.array(JobFieldSchema).max(100),
    hardSkills: z.array(JobFieldSchema).max(100),
    experienceEducation: z.array(JobFieldSchema).max(100),
    locationWorkMode: z.array(JobFieldSchema).max(100),
    availabilityDuration: z.array(JobFieldSchema).max(100),
  })
  .strict();

export const JobDescriptionSchema = JobDescriptionObjectSchema.superRefine(
  (jobDescription, context) => {
    const fields = [
      jobDescription.jobTitle,
      jobDescription.companyName,
      ...jobDescription.responsibilities,
      ...jobDescription.hardSkills,
      ...jobDescription.experienceEducation,
      ...jobDescription.locationWorkMode,
      ...jobDescription.availabilityDuration,
    ].filter((field) => field !== undefined);
    const seen = new Set<string>();

    for (const field of fields) {
      if (seen.has(field.fieldId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate JD field ID: ${field.fieldId}`,
        });
      }
      seen.add(field.fieldId);
    }
  },
);

export type JobDescription = z.infer<typeof JobDescriptionSchema>;

export interface JobDescriptionEvaluation {
  status: "ready" | "insufficient_content";
  companyDisplayName: string;
  jobDescription: JobDescription;
  omittedFieldIds: string[];
  warnings: Array<
    | "JOB_TITLE_MISSING"
    | "LOW_CONFIDENCE_FIELD_OMITTED"
    | "COMPANY_NAME_MISSING"
    | "JD_CONTENT_INSUFFICIENT"
  >;
}

export function evaluateJobDescription(input: unknown): JobDescriptionEvaluation {
  const jobDescription = JobDescriptionSchema.parse(input);
  const warnings: JobDescriptionEvaluation["warnings"] = [];
  const omittedFieldIds: string[] = [];
  const reliable = <T extends { confidence: number; fieldId: string }>(fields: T[]): T[] =>
    fields.filter((field) => {
      if (field.confidence >= JOB_FIELD_CONFIDENCE_THRESHOLD) {
        return true;
      }
      omittedFieldIds.push(field.fieldId);
      return false;
    });
  const reliableTitle = jobDescription.jobTitle?.confidence !== undefined &&
      jobDescription.jobTitle.confidence >= JOB_FIELD_CONFIDENCE_THRESHOLD
    ? jobDescription.jobTitle
    : undefined;
  if (jobDescription.jobTitle !== undefined && reliableTitle === undefined) {
    omittedFieldIds.push(jobDescription.jobTitle.fieldId);
  }
  const reliableCompany = jobDescription.companyName?.confidence !== undefined &&
      jobDescription.companyName.confidence >= JOB_FIELD_CONFIDENCE_THRESHOLD
    ? jobDescription.companyName
    : undefined;
  if (jobDescription.companyName !== undefined && reliableCompany === undefined) {
    omittedFieldIds.push(jobDescription.companyName.fieldId);
  }
  const normalized: JobDescription = {
    jobTitle: reliableTitle ?? {
      fieldId: "jd_job_title_fallback",
      text: JOB_TITLE_FALLBACK,
      confidence: 1,
    },
    ...(reliableCompany === undefined ? {} : { companyName: reliableCompany }),
    responsibilities: reliable(jobDescription.responsibilities),
    hardSkills: reliable(jobDescription.hardSkills),
    experienceEducation: reliable(jobDescription.experienceEducation),
    locationWorkMode: reliable(jobDescription.locationWorkMode),
    availabilityDuration: reliable(jobDescription.availabilityDuration),
  };

  if (reliableTitle === undefined) {
    warnings.push("JOB_TITLE_MISSING");
  }
  if (omittedFieldIds.length > 0) {
    warnings.push("LOW_CONFIDENCE_FIELD_OMITTED");
  }
  if (reliableCompany === undefined) {
    warnings.push("COMPANY_NAME_MISSING");
  }
  const usefulFieldCount =
    normalized.responsibilities.length +
    normalized.hardSkills.length +
    normalized.experienceEducation.length +
    normalized.locationWorkMode.length +
    normalized.availabilityDuration.length;
  if (usefulFieldCount === 0) {
    warnings.push("JD_CONTENT_INSUFFICIENT");
  }

  return {
    status: usefulFieldCount === 0 ? "insufficient_content" : "ready",
    companyDisplayName: reliableCompany?.text ?? COMPANY_NAME_FALLBACK,
    jobDescription: normalized,
    omittedFieldIds,
    warnings,
  };
}
