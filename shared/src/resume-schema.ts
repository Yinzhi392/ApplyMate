import { z } from "zod";

import { MAX_FACT_TEXT_VISIBLE_CHARACTERS } from "./limits.js";
import { countVisibleCharacters } from "./text.js";

export const FactIdSchema = z.string().regex(/^fact_[a-f0-9]{24}$/u);
export const FactHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const RequiredLabelSchema = z.string().trim().min(1).max(200);
const OptionalLabelSchema = RequiredLabelSchema.optional();
const OptionalDateSchema = z.string().trim().min(1).max(32).optional();
const FactTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => countVisibleCharacters(value) <= MAX_FACT_TEXT_VISIBLE_CHARACTERS,
    "Fact text exceeds 2000 visible characters.",
  );

function factShape<TSource extends string>(sourceType: TSource) {
  return {
    factId: FactIdSchema,
    sourceType: z.literal(sourceType),
    text: FactTextSchema,
    factHash: FactHashSchema,
  };
}

export const EducationFactSchema = z
  .object({
    ...factShape("education"),
    school: RequiredLabelSchema,
    major: OptionalLabelSchema,
    degree: OptionalLabelSchema,
    startDate: OptionalDateSchema,
    endDate: OptionalDateSchema,
  })
  .strict();

export const ExperienceFactSchema = z
  .object({
    ...factShape("experience"),
    organization: RequiredLabelSchema,
    role: RequiredLabelSchema,
    startDate: OptionalDateSchema,
    endDate: OptionalDateSchema,
  })
  .strict();

export const ProjectFactSchema = z
  .object({
    ...factShape("project"),
    name: RequiredLabelSchema,
    role: OptionalLabelSchema,
  })
  .strict();

export const SkillFactSchema = z
  .object({
    ...factShape("skill"),
    name: RequiredLabelSchema,
    level: OptionalLabelSchema,
  })
  .strict();

export const LanguageFactSchema = z
  .object({
    ...factShape("language"),
    name: RequiredLabelSchema,
    level: OptionalLabelSchema,
  })
  .strict();

export const CertificateFactSchema = z
  .object({
    ...factShape("certificate"),
    name: RequiredLabelSchema,
    issuer: OptionalLabelSchema,
  })
  .strict();

export const AchievementFactSchema = z
  .object({
    ...factShape("achievement"),
    name: RequiredLabelSchema,
  })
  .strict();

export const PreferenceFactSchema = z
  .object(factShape("preference"))
  .strict();

export const OtherFactSchema = z.object(factShape("other")).strict();

export const ResumeProfileSchema = z
  .object({
    resumeId: z.string().regex(/^resume_[A-Za-z0-9_-]{8,64}$/u),
    name: OptionalLabelSchema,
    education: z.array(EducationFactSchema).max(50),
    experiences: z.array(ExperienceFactSchema).max(50),
    projects: z.array(ProjectFactSchema).max(50),
    skills: z.array(SkillFactSchema).max(100),
    languages: z.array(LanguageFactSchema).max(50),
    certificates: z.array(CertificateFactSchema).max(50),
    achievements: z.array(AchievementFactSchema).max(50),
    preferences: z.array(PreferenceFactSchema).max(100),
    otherFacts: z.array(OtherFactSchema).max(100),
    confirmed: z.boolean(),
  })
  .strict();

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;
