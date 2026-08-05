import { z } from "zod";

import { JobFieldIdSchema } from "./job-description.js";
import { FactIdSchema } from "./resume-schema.js";
import { countVisibleCharacters } from "./text.js";

export const FactEvidenceSourceSchema = z
  .object({
    type: z.literal("fact"),
    factId: FactIdSchema,
  })
  .strict();

export const JobEvidenceSourceSchema = z
  .object({
    type: z.literal("jd"),
    fieldId: JobFieldIdSchema,
  })
  .strict();

export const EvidenceSourceSchema = z.discriminatedUnion("type", [
  FactEvidenceSourceSchema,
  JobEvidenceSourceSchema,
]);

export const GeneratedClaimSchema = z
  .object({
    claimId: z.string().regex(/^claim_[A-Za-z0-9_-]{1,64}$/u),
    text: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => countVisibleCharacters(value) <= 500,
        "Claim exceeds 500 visible characters.",
      ),
    sources: z.array(EvidenceSourceSchema).min(1).max(10),
  })
  .strict();

export const GeneratedClaimsSchema = z
  .array(GeneratedClaimSchema)
  .min(1)
  .max(100)
  .superRefine((claims, context) => {
    const seen = new Set<string>();
    for (const claim of claims) {
      if (seen.has(claim.claimId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate claim ID: ${claim.claimId}`,
        });
      }
      seen.add(claim.claimId);
    }
  });

export type GeneratedClaim = z.infer<typeof GeneratedClaimSchema>;

export interface EvidenceSourceRegistry {
  factIds: ReadonlySet<string>;
  jdFieldIds: ReadonlySet<string>;
}

export interface ClaimEvidenceValidation {
  valid: boolean;
  claims: GeneratedClaim[] | null;
  errors: string[];
}

export function validateClaimEvidence(
  input: unknown,
  registry: EvidenceSourceRegistry,
): ClaimEvidenceValidation {
  const parsed = GeneratedClaimsSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, claims: null, errors: ["INVALID_CLAIM_SCHEMA"] };
  }

  const errors = new Set<string>();
  for (const claim of parsed.data) {
    for (const source of claim.sources) {
      if (source.type === "fact" && !registry.factIds.has(source.factId)) {
        errors.add(`UNKNOWN_FACT_ID:${source.factId}`);
      }
      if (source.type === "jd" && !registry.jdFieldIds.has(source.fieldId)) {
        errors.add(`UNKNOWN_JD_FIELD_ID:${source.fieldId}`);
      }
    }
  }

  return {
    valid: errors.size === 0,
    claims: parsed.data,
    errors: Array.from(errors),
  };
}
