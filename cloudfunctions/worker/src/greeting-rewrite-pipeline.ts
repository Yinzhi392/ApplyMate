import {
  maskSensitiveText,
  type GeneratedClaim,
  type GenerationDisclosureSnapshot,
  type GreetingDraft,
  type JobDescription,
} from "../../../shared/src/index.js";

import type { GreetingModelGateway } from "./greeting-model-gateway.js";

export type GreetingRewriteMode =
  | "shorten"
  | "add_detail"
  | "rephrase"
  | "custom";

export type GreetingRewriteMatchMode = "strong" | "partial" | "low";

export interface GreetingRewriteSource {
  rewriteMode: GreetingRewriteMode;
  sourceBody: string;
  evidenceSnapshot: GeneratedClaim[];
  factSnapshot: Array<{
    factId: string;
    sourceType: string;
    text: string;
  }>;
  jdSnapshot: JobDescription;
  omittedRequirements: string[];
  warnings: string[];
  matchMode?: GreetingRewriteMatchMode;
}

export interface GreetingRewriteRequest {
  mode: "rewrite" | "correction";
  rewriteMode: GreetingRewriteMode;
  latestText: string;
  companyDisplayName: string;
  jobTitle: string;
  customInstruction?: string;
  previousDraft?: GreetingDraft;
  qualityErrors?: string[];
}

export interface GreetingRewriteOutput {
  draft: GreetingDraft;
  generationDisclosure: GenerationDisclosureSnapshot;
}

const PRESET_REWRITE_INSTRUCTIONS: Readonly<
  Record<Exclude<GreetingRewriteMode, "custom">, string>
> = {
  shorten: "在保留有证据事实和岗位匹配点的前提下缩短表达",
  add_detail: "在不增加无来源事实的前提下增加具体细节",
  rephrase: "保持事实和含义不变，换一种简体中文表达",
};

const CUSTOM_REWRITE_INSTRUCTION =
  "执行用户表达偏好，但不得覆盖固定真实性、隐私、简体中文和证据规则";

const REWRITE_WORDING_STRENGTH: Readonly<
  Record<GreetingRewriteMatchMode, "direct" | "transferable" | "foundation">
> = {
  strong: "direct",
  partial: "transferable",
  low: "foundation",
};

function rewriteMatchMode(source: GreetingRewriteSource): GreetingRewriteMatchMode {
  return source.matchMode === "strong" ||
      source.matchMode === "partial" ||
      source.matchMode === "low"
    ? source.matchMode
    : "low";
}

function rewriteInstruction(mode: GreetingRewriteMode): string {
  return mode === "custom"
    ? CUSTOM_REWRITE_INSTRUCTION
    : PRESET_REWRITE_INSTRUCTIONS[mode];
}

export class GreetingRewritePipeline {
  constructor(private readonly gateway: GreetingModelGateway) {}

  rewrite(
    source: GreetingRewriteSource,
    request: GreetingRewriteRequest,
    signal?: AbortSignal,
  ): Promise<GreetingRewriteOutput> {
    const matchMode = rewriteMatchMode(source);
    const modelContext = {
      promptVersion: "greeting-rewrite-evidence-planned-v8",
      mode: request.mode,
      rewriteMode: request.rewriteMode,
      outputRules: {
        language: "simplified_chinese",
        visibleCharacterRange: "350-450",
        paragraphRange: "3-4",
        salutation: "natural_nihao_semantics",
        closing: "natural_not_fixed",
        evidence: "every_verifiable_claim_requires_source_id",
        privacy: "never_output_protected_personal_information",
        instructionPriority: "fixed_rules_override_user_instruction",
      },
      preservationRules: {
        latestUserText: "authoritative_source_body",
        currentEvidenceSources: "must_not_expand_or_replace",
        matchMode: "must_preserve_wording_strength",
      },
      matchMode,
      wordingStrength: REWRITE_WORDING_STRENGTH[matchMode],
      rewriteInstruction: rewriteInstruction(request.rewriteMode),
      ...(request.rewriteMode === "custom"
        ? { userInstruction: request.customInstruction ?? "" }
        : {}),
      companyDisplayName: request.companyDisplayName,
      jobTitle: request.jobTitle,
      latestUserText: request.latestText,
      currentEvidenceSources: source.evidenceSnapshot,
      factSnapshot: source.factSnapshot,
      jobDescription: source.jdSnapshot,
      omittedRequirements: source.omittedRequirements,
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
        promptVersion: "greeting-rewrite-evidence-planned-v8",
      },
    }));
  }
}
