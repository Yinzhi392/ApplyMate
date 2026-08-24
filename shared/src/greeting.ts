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
  "MODEL_SELF_REFERENCE_PRESENT",
  "MECHANICAL_TEMPLATE_PRESENT",
  "COMPANY_REFERENCE_MISSING",
  "JOB_TITLE_MISSING",
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
  visibleCharacterCount: number;
  paragraphCount: number;
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

function containsModelSelfReference(value: string): boolean {
  return [
    /作为(?:一个)?AI/iu,
    /我是(?:一个)?(?:AI|人工智能|语言模型)/iu,
    /as an? (?:ai|language model)/iu,
  ].some((pattern) => pattern.test(value));
}

function isNegatedMechanicalTerm(clause: string, termIndex: number): boolean {
  const prefix = clause.slice(Math.max(0, termIndex - 32), termIndex);
  return /(?:不会|并非|不是|避免|禁止|拒绝|无需|无须)(?:把|将)?[^,，]{0,24}(?:弱化为|称为|写成|表述为)?$/u.test(prefix);
}

function containsSelfDowngradingAnalysisPractice(clause: string): boolean {
  const term = "分析练习";
  let termIndex = clause.indexOf(term);
  while (termIndex >= 0) {
    const suffix = clause.slice(termIndex + term.length);
    if (!suffix.startsWith("题") && !isNegatedMechanicalTerm(clause, termIndex)) {
      return true;
    }
    termIndex = clause.indexOf(term, termIndex + term.length);
  }
  return false;
}

export function containsMechanicalGreetingPhrase(value: string): boolean {
  const normalized = value.normalize("NFKC").replace(/\s+/gu, "");
  const patterns = [
    /看到岗位主要围绕[^。！？!?;；]{0,40}展开/iu,
    /这些要求与我的经历和能力比较契合/iu,
    /这段积累能支持我/iu,
    /看到岗位(?:主要|重点)[^。！？!?;；]{0,30}(?:负责|要求|强调)/iu,
    /希望(?:能|可以|进一步)?贴近真实工作/iu,
    /希望用[^。！？!?;；]{0,20}(?:练习|尝试)[^。！？!?;；]{0,20}贴近真实工作/iu,
    /这些练习/iu,
    /愿意[^。！？!?;；]{0,12}踏实学习/iu,
    /学习能力强/iu,
    /虽然[^。！？!?;；]{0,24}(?:没有|缺少|不具备)[^。！？!?;；]{0,24}(?:但是|但|不过)/iu,
    /缺少(?:相关|直接|对口|该岗位)?[^。！？!?;；]{0,8}(?:经验|经历)/iu,
    /暂时没有[^。！？!?;；]{0,12}(?:对口|相关|直接)?经历/iu,
    /不完全匹配/iu,
    /希望[^。！？!?;；]{0,12}弥补[^。！？!?;；]{0,8}不足/iu,
  ];
  return normalized
    .split(/[。！？!?;；]+/u)
    .filter(Boolean)
    .some(
      (clause) =>
        patterns.some((pattern) => pattern.test(clause)) ||
        containsSelfDowngradingAnalysisPractice(clause),
    );
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
  if (containsModelSelfReference(body)) {
    errors.add("MODEL_SELF_REFERENCE_PRESENT");
  }
  if (containsMechanicalGreetingPhrase(body)) {
    errors.add("MECHANICAL_TEMPLATE_PRESENT");
  }
  if (!hasValidUnicode(body)) {
    errors.add("INVALID_UNICODE");
  }

  return { valid: errors.size === 0, errors: Array.from(errors) };
}

export function validateAiGreetingForJob(
  input: unknown,
  registry: EvidenceSourceRegistry,
  companyDisplayName: string,
  jobTitle: string,
): GreetingQualityResult {
  const result = validateAiGreeting(input, registry);
  const parsed = GreetingDraftSchema.safeParse(input);
  if (!parsed.success) {
    return result;
  }
  const errors = new Set(result.errors);
  if (!parsed.data.body.includes(companyDisplayName)) {
    errors.add("COMPANY_REFERENCE_MISSING");
  }
  if (!parsed.data.body.includes(jobTitle)) {
    errors.add("JOB_TITLE_MISSING");
  }
  return { valid: errors.size === 0, errors: Array.from(errors) };
}

export function evaluateManualGreeting(
  input: unknown,
  registry: EvidenceSourceRegistry,
): ManualGreetingEvaluation {
  const result = validateAiGreeting(input, registry);
  const parsed = GreetingDraftSchema.safeParse(input);
  const bodyDescriptor =
    input !== null && typeof input === "object"
      ? Object.getOwnPropertyDescriptor(input, "body")
      : undefined;
  const body = parsed.success
    ? parsed.data.body
    : typeof bodyDescriptor?.value === "string"
      ? bodyDescriptor.value
      : "";

  return {
    canSave: true,
    canCopy: true,
    visibleCharacterCount: countVisibleCharacters(body),
    paragraphCount: splitNonEmptyParagraphs(body).length,
    warnings: result.errors,
  };
}
