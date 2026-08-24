import { z } from "zod";

export const GREETING_MATCH_PLAN_KEYS = [
  "jobTitle",
  "companyName",
  "coreFunctions",
  "domainContext",
  "matchMode",
  "directFactIds",
  "transferableEvidence",
  "supportingFactIds",
  "gaps",
  "paragraphs",
] as const;

const FactIdSchema = z.string().trim().min(1).max(128);

export const RequirementTypeSchema = z.enum([
  "responsibilities",
  "hardSkills",
  "experienceEducation",
  "locationWorkMode",
  "availabilityDuration",
]);

export const MatchModeSchema = z.enum(["strong", "partial", "low"]);

export const WordingStrengthSchema = z.enum(["transferable", "foundation"]);

const CoreFunctionSchema = z
  .object({
    requirementType: RequirementTypeSchema,
    requirementIndex: z.int().min(0).max(19),
    summary: z.string().trim().min(1).max(100),
  })
  .strict();

const TransferableEvidenceSchema = z
  .object({
    factId: FactIdSchema,
    capability: z.string().trim().min(1).max(120),
    wordingStrength: WordingStrengthSchema,
  })
  .strict();

export const GreetingMatchPlanSchema = z
  .object({
    jobTitle: z.string().trim().min(1).max(200),
    companyName: z.string().trim().max(200),
    coreFunctions: z.array(CoreFunctionSchema).min(2).max(5),
    domainContext: z.array(z.string().trim().min(1).max(80)).max(4),
    matchMode: MatchModeSchema,
    directFactIds: z.array(FactIdSchema).max(4),
    transferableEvidence: z.array(TransferableEvidenceSchema).max(4),
    supportingFactIds: z.array(FactIdSchema).max(4),
    gaps: z.array(z.string().trim().min(1).max(160)).max(5),
    paragraphs: z.array(z.string().trim().min(1).max(2_000)).min(2).max(5),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const evidenceLayers = [
      ["direct", plan.directFactIds],
      [
        "transferable",
        plan.transferableEvidence.map(({ factId }) => factId),
      ],
      ["supporting", plan.supportingFactIds],
    ] as const;
    const firstLayerByFactId = new Map<string, string>();

    for (const [layer, factIds] of evidenceLayers) {
      for (const factId of factIds) {
        const previousLayer = firstLayerByFactId.get(factId);
        if (previousLayer !== undefined) {
          ctx.addIssue({
            code: "custom",
            message: "Fact IDs cannot be reused within a greeting match plan",
          });
        } else {
          firstLayerByFactId.set(factId, layer);
        }
      }
    }

    if (plan.matchMode === "strong" && plan.directFactIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["directFactIds"],
        message: "Strong matches require direct evidence",
      });
    }

    if (plan.matchMode === "partial") {
      if (plan.transferableEvidence.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["transferableEvidence"],
          message: "Partial matches require transferable evidence",
        });
      }
      if (plan.gaps.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["gaps"],
          message: "Partial matches require a gap",
        });
      }
    }

    if (plan.matchMode === "low") {
      if (plan.directFactIds.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["directFactIds"],
          message: "Low matches cannot include direct evidence",
        });
      }
      if (plan.transferableEvidence.some(({ wordingStrength }) => wordingStrength !== "foundation")) {
        ctx.addIssue({
          code: "custom",
          path: ["transferableEvidence"],
          message: "Low matches can only include foundation-strength transferable evidence",
        });
      }
      if (plan.supportingFactIds.length === 0 && plan.transferableEvidence.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["supportingFactIds"],
          message: "Low matches require supporting or foundation evidence",
        });
      }
      if (plan.gaps.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["gaps"],
          message: "Low matches require a gap",
        });
      }
    }
  });

export type GreetingMatchPlan = z.infer<typeof GreetingMatchPlanSchema>;

export function collectGreetingFactIds(plan: GreetingMatchPlan): string[] {
  return Array.from(
    new Set([
      ...plan.directFactIds,
      ...plan.transferableEvidence.map(({ factId }) => factId),
      ...plan.supportingFactIds,
    ]),
  );
}
