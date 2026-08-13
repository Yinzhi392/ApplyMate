export interface LockedEvaluationCase {
  caseId: string;
  confirmed: boolean;
  version: string;
  resume: string;
  jd: string;
  maskedCount: number;
  truth: Record<string, string | undefined>;
  allowedFacts: string[];
  forbiddenFacts: string[];
}

export interface EvaluationVerdict {
  schemaValid: boolean;
  compliant: boolean;
  hallucinationCount: number;
  errors?: string[];
  fieldResults?: Array<{ fieldId: string; correct: boolean }>;
  visibleCharacterCount?: number;
  paragraphCount?: number;
  malformedClaimCount?: number;
  claimMismatchCount?: number;
  unknownSourceCount?: number;
  selectedFactIds?: string[];
  omittedRequirements?: string[];
}

export const TOKENHUB_BASE_URL: string;
export const TOKENHUB_MODELS: string[];
export const TOKENHUB_TASKS: string[];

export function hashText(value: string): string;
export function maskProtectedText(value: string): {
  text: string;
  matchCount: number;
};
export function assertNoProtectedText(value: string): void;
export function loadLockedCases(filePath: string): LockedEvaluationCase[];
export function buildPlan(
  cases: LockedEvaluationCase[],
): Array<{ caseId: string; modelId: string; task: string }>;
export function buildSources(fixtureCase: LockedEvaluationCase): {
  facts: Array<{ factId: string; text: string }>;
  jdFields: Array<{ fieldId: string; text: string | undefined }>;
};
export function buildPrompt(
  task: string,
  fixtureCase: LockedEvaluationCase,
  latestBody?: string,
): string;
export function evaluateStructure(
  value: unknown,
  fixtureCase: LockedEvaluationCase,
): EvaluationVerdict;
export function evaluateGreeting(
  value: unknown,
  fixtureCase: LockedEvaluationCase,
): EvaluationVerdict;
export function renderDeterministicGreeting(
  fixtureCase: LockedEvaluationCase,
  selectedFactIds: string[],
  omittedRequirements?: string[],
  variant?: "generate" | "rewrite",
): unknown;
export function parseJsonResponse(content: string): unknown;
export function safeCheckpointEntry(input: {
  caseId: string;
  modelId: string;
  task: string;
  durationMs: number;
  usage?: Record<string, unknown>;
  input: string;
  output: string;
  verdict: EvaluationVerdict;
  status?: "completed" | "timeout" | "failed" | "skipped";
}): Record<string, unknown>;
export function assertSafeCheckpoint(value: unknown): void;
export function summarize(entries: Array<Record<string, unknown>>): unknown[];
