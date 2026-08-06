import { z } from "zod";

import type {
  JobDescription,
  PreferenceFact,
  ResumeProfile,
} from "../../../shared/src/index.js";
import { MAX_JD_IMAGE_COUNT } from "../../../shared/src/index.js";

const ResumeIdSchema = z.string().regex(/^resume_[A-Za-z0-9_-]{8,64}$/u);
const FileIdSchema = z.string().trim().min(1).max(100);

export const GenerationCreatePayloadSchema = z.discriminatedUnion("inputType", [
  z
    .object({
      resumeId: ResumeIdSchema,
      inputType: z.literal("text"),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      resumeId: ResumeIdSchema,
      inputType: z.literal("images"),
      fileIds: z.array(FileIdSchema).min(1).max(MAX_JD_IMAGE_COUNT),
    })
    .strict(),
]);

export const GenerationConfirmJdPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1).max(100),
    jobDescription: z.unknown(),
  })
  .strict();

export type GenerationCreateInput = z.infer<typeof GenerationCreatePayloadSchema>;
export type ValidatedJdInput =
  | { inputType: "text"; sourceText: string }
  | { inputType: "images"; fileIds: string[] };

export type GenerationRecordStatus =
  | "processing"
  | "awaiting_confirmation"
  | "generating"
  | "succeeded"
  | "failed";

export interface GenerationRecord {
  jobId: string;
  userId: string;
  resumeId: string;
  inputType: ValidatedJdInput["inputType"];
  temporaryFileIds: string[];
  sourceText?: string;
  resumeSnapshot: ResumeProfile;
  preferenceSnapshot: PreferenceFact[];
  status: GenerationRecordStatus;
  extractedMaskedText?: string;
  jobDescription?: JobDescription;
  pendingFieldIds?: string[];
  warnings?: string[];
  createdAt: string;
  updatedAt: string;
}
