import { z } from "zod";

import { countVisibleCharacters } from "./text.js";

export const JOB_FIELD_CONFIDENCE_THRESHOLD = 0.8;
export const COMPANY_NAME_FALLBACK = "贵司";

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
  status: "ready" | "awaiting_user_confirmation";
  companyDisplayName: string;
  confirmFieldIds: string[];
  warnings: Array<"JOB_TITLE_REQUIRED" | "LOW_CONFIDENCE_FIELD" | "COMPANY_NAME_MISSING">;
}

export function evaluateJobDescription(input: unknown): JobDescriptionEvaluation {
  const jobDescription = JobDescriptionSchema.parse(input);
  const warnings: JobDescriptionEvaluation["warnings"] = [];
  const criticalFields = [
    jobDescription.jobTitle,
    ...jobDescription.responsibilities,
    ...jobDescription.hardSkills,
    ...jobDescription.experienceEducation,
    ...jobDescription.locationWorkMode,
    ...jobDescription.availabilityDuration,
  ].filter((field) => field !== undefined);
  const confirmFieldIds = criticalFields
    .filter(({ confidence }) => confidence < JOB_FIELD_CONFIDENCE_THRESHOLD)
    .map(({ fieldId }) => fieldId);

  if (jobDescription.jobTitle === undefined) {
    warnings.push("JOB_TITLE_REQUIRED");
  }
  if (confirmFieldIds.length > 0) {
    warnings.push("LOW_CONFIDENCE_FIELD");
  }
  if (jobDescription.companyName === undefined) {
    warnings.push("COMPANY_NAME_MISSING");
  }

  return {
    status:
      jobDescription.jobTitle === undefined || confirmFieldIds.length > 0
        ? "awaiting_user_confirmation"
        : "ready",
    companyDisplayName: jobDescription.companyName?.text ?? COMPANY_NAME_FALLBACK,
    confirmFieldIds,
    warnings,
  };
}
