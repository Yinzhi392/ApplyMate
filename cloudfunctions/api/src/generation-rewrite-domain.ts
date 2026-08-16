import { z } from "zod";

import type {
  GeneratedClaim,
  JobDescription,
} from "../../../shared/src/index.js";

import type { ApplicationFactSnapshot } from "./application-domain.js";

export const REWRITE_MODES = [
  "shorten",
  "add_detail",
  "rephrase",
  "custom",
] as const;

export const GenerationRewritePayloadSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(100),
    mode: z.enum(REWRITE_MODES),
    instruction: z.string().optional(),
  })
  .strict()
  .superRefine(({ mode, instruction }, context) => {
    const normalized = instruction?.trim();
    if (mode === "custom" && (normalized === undefined || normalized === "")) {
      context.addIssue({
        code: "custom",
        path: ["instruction"],
        message: "Custom rewrite requires an instruction.",
      });
    }
    if (mode !== "custom" && instruction !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["instruction"],
        message: "Preset rewrite modes do not accept instructions.",
      });
    }
  });

export type GenerationRewriteInput = z.infer<
  typeof GenerationRewritePayloadSchema
>;
export type RewriteMode = (typeof REWRITE_MODES)[number];
export type RewriteRecordStatus = "processing" | "succeeded" | "failed";
export type RewriteMatchMode = "strong" | "partial" | "low";

export interface RewriteRecord {
  jobId: string;
  userId: string;
  applicationId: string;
  rewriteMode: RewriteMode;
  customInstruction?: string;
  sourceBody: string;
  sourceApplicationUpdatedAt: string;
  evidenceSnapshot: GeneratedClaim[];
  factSnapshot: ApplicationFactSnapshot[];
  jdSnapshot: JobDescription;
  omittedRequirements: string[];
  warnings: string[];
  matchMode?: RewriteMatchMode;
  status: RewriteRecordStatus;
  createdAt: string;
  updatedAt: string;
}
