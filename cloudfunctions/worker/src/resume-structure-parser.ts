import { z } from "zod";

import {
  ResumeProfileSchema,
  createFactId,
  hashFactText,
  type FactSourceType,
  type ResumeProfile,
} from "../../../shared/src/index.js";

import { ResumeProcessingError } from "./resume-processing-error.js";

const RequiredTextSchema = z.string().trim().min(1).max(2_000);
const RequiredLabelSchema = z.string().trim().min(1).max(200);
const OptionalLabelSchema = RequiredLabelSchema.optional();
const OptionalDateSchema = z.string().trim().min(1).max(32).optional();

const EducationInputSchema = z
  .object({
    school: RequiredLabelSchema,
    major: OptionalLabelSchema,
    degree: OptionalLabelSchema,
    startDate: OptionalDateSchema,
    endDate: OptionalDateSchema,
    text: RequiredTextSchema,
  })
  .strict();
const ExperienceInputSchema = z
  .object({
    organization: RequiredLabelSchema,
    role: RequiredLabelSchema,
    startDate: OptionalDateSchema,
    endDate: OptionalDateSchema,
    text: RequiredTextSchema,
  })
  .strict();
const ProjectInputSchema = z
  .object({ name: RequiredLabelSchema, role: OptionalLabelSchema, text: RequiredTextSchema })
  .strict();
const SkillInputSchema = z
  .object({ name: RequiredLabelSchema, level: OptionalLabelSchema, text: RequiredTextSchema })
  .strict();
const LanguageInputSchema = SkillInputSchema;
const CertificateInputSchema = z
  .object({ name: RequiredLabelSchema, issuer: OptionalLabelSchema, text: RequiredTextSchema })
  .strict();
const NamedFactInputSchema = z
  .object({ name: RequiredLabelSchema, text: RequiredTextSchema })
  .strict();
const OtherFactInputSchema = z.object({ text: RequiredTextSchema }).strict();

const StructuredResumeInputSchema = z
  .object({
    name: OptionalLabelSchema,
    education: z.array(EducationInputSchema).max(50),
    experiences: z.array(ExperienceInputSchema).max(50),
    projects: z.array(ProjectInputSchema).max(50),
    skills: z.array(SkillInputSchema).max(100),
    languages: z.array(LanguageInputSchema).max(50),
    certificates: z.array(CertificateInputSchema).max(50),
    achievements: z.array(NamedFactInputSchema).max(50),
    otherFacts: z.array(OtherFactInputSchema).max(100),
  })
  .strict();

type StructuredResumeInput = z.infer<typeof StructuredResumeInputSchema>;

export interface ResumeStructureModelPort {
  parseStructuredResume(maskedText: string): Promise<unknown>;
}

function factBase(sourceType: FactSourceType, text: string) {
  return {
    factId: createFactId(sourceType, text),
    sourceType,
    text: text.trim(),
    factHash: hashFactText(text),
  };
}

function toResumeProfile(
  resumeId: string,
  input: StructuredResumeInput,
): ResumeProfile {
  return ResumeProfileSchema.parse({
    resumeId,
    ...(input.name === undefined ? {} : { name: input.name }),
    education: input.education.map(({ text, ...fields }) => ({
      ...factBase("education", text),
      ...fields,
    })),
    experiences: input.experiences.map(({ text, ...fields }) => ({
      ...factBase("experience", text),
      ...fields,
    })),
    projects: input.projects.map(({ text, ...fields }) => ({
      ...factBase("project", text),
      ...fields,
    })),
    skills: input.skills.map(({ text, ...fields }) => ({
      ...factBase("skill", text),
      ...fields,
    })),
    languages: input.languages.map(({ text, ...fields }) => ({
      ...factBase("language", text),
      ...fields,
    })),
    certificates: input.certificates.map(({ text, ...fields }) => ({
      ...factBase("certificate", text),
      ...fields,
    })),
    achievements: input.achievements.map(({ text, ...fields }) => ({
      ...factBase("achievement", text),
      ...fields,
    })),
    preferences: [],
    otherFacts: input.otherFacts.map(({ text }) => ({
      ...factBase("other", text),
    })),
    confirmed: false,
  });
}

function parseModelValue(value: unknown): StructuredResumeInput | null {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = StructuredResumeInputSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export class ResumeStructureParser {
  constructor(
    private readonly primary: ResumeStructureModelPort,
    private readonly fallback?: ResumeStructureModelPort,
  ) {}

  async parse(maskedText: string, resumeId: string): Promise<ResumeProfile> {
    const providers = [this.primary, ...(this.fallback === undefined ? [] : [this.fallback])];
    let modelThrew = 0;
    for (const provider of providers) {
      let value: unknown;
      try {
        value = await provider.parseStructuredResume(maskedText);
      } catch {
        modelThrew += 1;
        continue;
      }
      const parsed = parseModelValue(value);
      if (parsed !== null) {
        return toResumeProfile(resumeId, parsed);
      }
    }

    if (modelThrew === providers.length) {
      throw new ResumeProcessingError(
        "MODEL_FAILED",
        "Resume parsing is temporarily unavailable.",
        true,
      );
    }
    throw new ResumeProcessingError(
      "MODEL_INVALID_OUTPUT",
      "Resume parsing returned an invalid result.",
    );
  }
}
