export const SENSITIVE_DATA_TYPES = [
  "phone",
  "email",
  "nationalId",
  "documentNumber",
  "detailedAddress",
] as const;

export type SensitiveDataType = (typeof SENSITIVE_DATA_TYPES)[number];

export interface SensitiveMatch {
  type: SensitiveDataType;
  start: number;
  end: number;
}

export interface MaskedText {
  text: string;
  matches: SensitiveMatch[];
}

interface MaskingRule {
  type: SensitiveDataType;
  pattern: RegExp;
}

const MASKING_RULES: readonly MaskingRule[] = [
  {
    type: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  },
  {
    type: "nationalId",
    pattern:
      /(?<![0-9A-Z])\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9X](?![0-9A-Z])/giu,
  },
  {
    type: "documentNumber",
    pattern: /(?<![0-9A-Z])(?:(?:E|G)\d{8}|(?:P|S)\d{7})(?![0-9A-Z])/giu,
  },
  {
    type: "phone",
    pattern: /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}(?!\d)/gu,
  },
  {
    type: "detailedAddress",
    pattern:
      /(?:(?:[\p{Script=Han}]{2,8}(?:省|自治区))?[\p{Script=Han}]{2,8}市)?[\p{Script=Han}]{1,8}(?:区|县)[\p{Script=Han}0-9]{1,24}(?:大街|路|街|道|巷)[\p{Script=Han}0-9]{0,16}\d+(?:号|弄)(?:[\p{Script=Han}0-9-]{0,12}(?:室|栋|单元))?/gu,
  },
];

export function maskSensitiveText(value: string): MaskedText {
  const candidates = MASKING_RULES.flatMap(({ type, pattern }) =>
    Array.from(value.matchAll(pattern), (match): SensitiveMatch => ({
      type,
      start: match.index,
      end: match.index + match[0].length,
    })),
  ).sort((left, right) => left.start - right.start || right.end - left.end);

  const matches = candidates.filter(
    (candidate, index) =>
      !candidates.some(
        (other, otherIndex) =>
          otherIndex < index &&
          other.start < candidate.end &&
          candidate.start < other.end,
      ),
  );

  let text = value;
  for (const match of [...matches].reverse()) {
    text = `${text.slice(0, match.start)}[MASKED:${match.type}]${text.slice(match.end)}`;
  }

  return { text, matches };
}
