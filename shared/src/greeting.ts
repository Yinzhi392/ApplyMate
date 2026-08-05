import { z } from "zod";

import {
  GeneratedClaimsSchema,
  type EvidenceSourceRegistry,
  validateClaimEvidence,
} from "./evidence.js";
import {
  MAX_GREETING_PARAGRAPHS,
  MAX_GREETING_VISIBLE_CHARACTERS,
  MIN_GREETING_PARAGRAPHS,
  MIN_GREETING_VISIBLE_CHARACTERS,
} from "./limits.js";
import { maskSensitiveText } from "./masking.js";
import {
  countVisibleCharacters,
  hasValidUnicode,
  splitNonEmptyParagraphs,
} from "./text.js";

const KNOWN_TRADITIONAL_CHARACTERS = new Set(
  Array.from(
    "臺體學習經驗與為這來說裡後會發現專業應該貴崗項數據負責團隊實開發設計優勢並積極聯繫",
  ),
);

export const GreetingDraftSchema = z
  .object({
    body: z.string().min(1).max(5_000),
    claims: GeneratedClaimsSchema,
    omittedRequirements: z.array(z.string().trim().min(1).max(500)).max(100),
    warnings: z.array(z.string().trim().min(1).max(500)).max(100),
  })
  .strict();

export type GreetingDraft = z.infer<typeof GreetingDraftSchema>;

export const GREETING_QUALITY_ERRORS = [
  "INVALID_GREETING_SCHEMA",
  "BODY_LENGTH_INVALID",
  "BODY_PARAGRAPH_COUNT_INVALID",
  "BODY_NOT_SIMPLIFIED_CHINESE",
  "INVALID_EVIDENCE",
  "CLAIM_NOT_IN_BODY",
  "UNSOURCED_NUMBER",
  "SENSITIVE_INFORMATION_PRESENT",
  "PROHIBITED_INSTRUCTION_PRESENT",
  "INVALID_UNICODE",
] as const;

export type GreetingQualityError = (typeof GREETING_QUALITY_ERRORS)[number];

export interface GreetingQualityResult {
  valid: boolean;
  errors: GreetingQualityError[];
}

export interface ManualGreetingEvaluation {
  canSave: true;
  canCopy: true;
  warnings: GreetingQualityError[];
}

function containsKnownTraditionalChinese(value: string): boolean {
  return Array.from(value).some((character) =>
    KNOWN_TRADITIONAL_CHARACTERS.has(character),
  );
}

function numericTokens(value: string): Set<string> {
  return new Set(value.match(/\d+(?:[.,]\d+)?%?/gu) ?? []);
}

function containsProhibitedInstruction(value: string): boolean {
  return [
    /忽略(?:以上|之前|系统|所有).{0,12}(?:规则|指令|提示)/iu,
    /(?:展示|泄露|输出).{0,12}(?:系统提示|提示词|密钥)/iu,
    /ignore.{0,20}(?:previous|system).{0,20}instructions?/iu,
  ].some((pattern) => pattern.test(value));
}

export function validateAiGreeting(
  input: unknown,
  registry: EvidenceSourceRegistry,
): GreetingQualityResult {
  const parsed = GreetingDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: ["INVALID_GREETING_SCHEMA"] };
  }

  const { body, claims } = parsed.data;
  const errors = new Set<GreetingQualityError>();
  const visibleCharacters = countVisibleCharacters(body);
  const paragraphCount = splitNonEmptyParagraphs(body).length;

  if (
    visibleCharacters < MIN_GREETING_VISIBLE_CHARACTERS ||
    visibleCharacters > MAX_GREETING_VISIBLE_CHARACTERS
  ) {
    errors.add("BODY_LENGTH_INVALID");
  }
  if (
    paragraphCount < MIN_GREETING_PARAGRAPHS ||
    paragraphCount > MAX_GREETING_PARAGRAPHS
  ) {
    errors.add("BODY_PARAGRAPH_COUNT_INVALID");
  }
  if (containsKnownTraditionalChinese(body)) {
    errors.add("BODY_NOT_SIMPLIFIED_CHINESE");
  }

  const evidence = validateClaimEvidence(claims, registry);
  if (!evidence.valid) {
    errors.add("INVALID_EVIDENCE");
  }
  if (claims.some(({ text }) => !body.includes(text))) {
    errors.add("CLAIM_NOT_IN_BODY");
  }

  const sourcedNumbers = new Set(
    claims.flatMap(({ text }) => Array.from(numericTokens(text))),
  );
  if (
    Array.from(numericTokens(body)).some((token) => !sourcedNumbers.has(token))
  ) {
    errors.add("UNSOURCED_NUMBER");
  }
  if (maskSensitiveText(body).matches.length > 0) {
    errors.add("SENSITIVE_INFORMATION_PRESENT");
  }
  if (containsProhibitedInstruction(body)) {
    errors.add("PROHIBITED_INSTRUCTION_PRESENT");
  }
  if (!hasValidUnicode(body)) {
    errors.add("INVALID_UNICODE");
  }

  return { valid: errors.size === 0, errors: Array.from(errors) };
}

export function evaluateManualGreeting(
  input: unknown,
  registry: EvidenceSourceRegistry,
): ManualGreetingEvaluation {
  const result = validateAiGreeting(input, registry);

  return {
    canSave: true,
    canCopy: true,
    warnings: result.errors,
  };
}
