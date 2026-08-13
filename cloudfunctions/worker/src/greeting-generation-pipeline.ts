import {
  maskSensitiveText,
  type GreetingDraft,
  type GenerationDisclosureSnapshot,
  type JobDescription,
  type PreferenceFact,
  type ResumeProfile,
} from "../../../shared/src/index.js";

import type { GreetingModelGateway } from "./greeting-model-gateway.js";

export interface GreetingGenerationSource {
  resumeSnapshot: ResumeProfile;
  preferenceSnapshot: PreferenceFact[];
  extractedMaskedText?: string;
  jobDescription?: JobDescription;
}

export interface GreetingGenerationRequest {
  mode: "initial" | "correction";
  companyDisplayName: string;
  jobTitle: string;
  previousDraft?: GreetingDraft;
  qualityErrors?: string[];
}

export interface GreetingGenerationOutput {
  draft: GreetingDraft;
  generationDisclosure: GenerationDisclosureSnapshot;
}

function facts(profile: ResumeProfile) {
  return [
    ...profile.education,
    ...profile.experiences,
    ...profile.projects,
    ...profile.skills,
    ...profile.languages,
    ...profile.certificates,
    ...profile.achievements,
    ...profile.preferences,
    ...profile.otherFacts,
  ].map(({ factId, sourceType, text }) => ({ factId, sourceType, text }));
}

export class GreetingGenerationPipeline {
  constructor(private readonly gateway: GreetingModelGateway) {}

  generate(
    source: GreetingGenerationSource,
    request: GreetingGenerationRequest,
    signal?: AbortSignal,
  ): Promise<GreetingGenerationOutput> {
    const modelContext = {
      promptVersion: "greeting-v1",
      mode: request.mode,
      outputRules: {
        language: "simplified_chinese",
        visibleCharacters: "250-350",
        paragraphs: "2-3",
        evidence: "every_verifiable_claim_requires_source_id",
      },
      companyDisplayName: request.companyDisplayName,
      jobTitle: request.jobTitle,
      resumeFacts: [
        ...facts(source.resumeSnapshot),
        ...source.preferenceSnapshot.map(({ factId, sourceType, text }) => ({
          factId,
          sourceType,
          text,
        })),
      ],
      jobDescription: source.jobDescription,
      extractedJdText: source.extractedMaskedText,
      ...(request.mode === "correction"
        ? {
            previousDraft: request.previousDraft,
            qualityErrors: request.qualityErrors ?? [],
          }
        : {}),
    };
    const maskedInput = maskSensitiveText(JSON.stringify(modelContext)).text;
    return this.gateway.generateWithMetadata(maskedInput, signal).then(({ draft, model }) => ({
      draft,
      generationDisclosure: {
        ...model,
        promptVersion: "greeting-v1",
      },
    }));
  }
}
