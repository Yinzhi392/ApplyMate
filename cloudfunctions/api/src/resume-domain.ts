import { z } from "zod";

import {
  MAX_RESUME_IMAGE_COUNT,
  ResumeProfileSchema,
  type ResumeProfile,
} from "../../../shared/src/index.js";

export const ResumeParsePayloadSchema = z.discriminatedUnion("inputType", [
  z.object({ inputType: z.literal("text"), text: z.string() }).strict(),
  z
    .object({ inputType: z.literal("pdf"), fileId: z.string().trim().min(1).max(100) })
    .strict(),
  z
    .object({ inputType: z.literal("docx"), fileId: z.string().trim().min(1).max(100) })
    .strict(),
  z
    .object({
      inputType: z.literal("images"),
      fileIds: z
        .array(z.string().trim().min(1).max(100))
        .min(1)
        .max(MAX_RESUME_IMAGE_COUNT),
    })
    .strict(),
]);

export type ResumeParseInput = z.infer<typeof ResumeParsePayloadSchema>;
export const ResumeConfirmPayloadSchema = z
  .object({
    resumeId: z.string().regex(/^resume_[A-Za-z0-9_-]{8,64}$/u),
    profile: ResumeProfileSchema,
  })
  .strict();
export const ResumeIdPayloadSchema = z
  .object({ resumeId: z.string().regex(/^resume_[A-Za-z0-9_-]{8,64}$/u) })
  .strict();
export type ResumeRecordStatus =
  | "processing"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export interface ResumeRecord {
  resumeId: string;
  userId: string;
  jobId: string;
  inputType: ResumeParseInput["inputType"];
  temporaryFileIds: string[];
  sourceText?: string;
  status: ResumeRecordStatus;
  profile?: ResumeProfile;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

export interface CreatedResumeParseJob {
  resumeId: string;
  jobId: string;
}
