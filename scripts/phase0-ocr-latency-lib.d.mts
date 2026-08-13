export interface OcrImageVariant {
  id: "original-png" | "jpeg-960-q85" | "jpeg-720-q80";
  width: number;
  height: number;
  format: "PNG" | "JPEG";
  quality?: number;
  alterationRank: number;
}

export interface SafeOcrObservation {
  caseId: string;
  variantId: OcrImageVariant["id"];
  runIndex: number;
  imageSha256: string;
  imageByteLength: number;
  width: number;
  height: number;
  format: string;
  totalDurationMs: number;
  timing: Record<string, number | null | Record<string, number | null>>;
  sourceCharacterRecall: number;
  correctFieldCount: number;
  errorCode: string | null;
}

export const OCR_LATENCY_DIAGNOSTIC_VERSION: string;
export const OCR_HOST: string;
export const OCR_ACTION: string;
export const OCR_VERSION: string;
export const OCR_REGION: string;
export const OCR_TIMEOUT_MS: number;
export const REPRESENTATIVE_CASE_IDS: string[];
export const OCR_IMAGE_VARIANTS: OcrImageVariant[];
export const DIAGNOSTIC_REPETITIONS: number;
export const FULL_RETEST_CALLS: number;
export const MAX_OCR_CALLS: number;

export function createDiagnosticPlan(): {
  diagnosticCalls: Array<{
    caseId: string;
    variantId: OcrImageVariant["id"];
    runIndex: number;
  }>;
  fullRetestCalls: number;
  maximumCalls: number;
};
export function assertCredentialEnvironment(
  environment: Record<string, string | undefined>,
): void;
export function buildTc3Headers(input: {
  secretId: string;
  secretKey: string;
  body: string;
  timestamp: number;
}): Record<string, string>;
export function parseLockedCases(sourcePath: string): Map<string, string>;
export function calculateCharacterRecall(source: string, observed: string): number;
export function evaluateOcrEvidence(
  source: string,
  texts: string[],
): { recall: number; correctFieldCount: number };
export function selectWinningVariant(observations: Array<{
  variantId: OcrImageVariant["id"];
  totalDurationMs: number;
  correctFieldCount: number;
  errorCode: string | null;
}>): {
  candidates: Array<{
    variantId: OcrImageVariant["id"];
    passed: boolean;
    fieldAccuracy: number;
  }>;
  winner: { variantId: OcrImageVariant["id"] } | null;
};
export function createSafeObservation(input: {
  caseId: string;
  variant: OcrImageVariant;
  runIndex: number;
  image: Buffer;
  timing: {
    totalDurationMs: number;
    phases: Record<string, number | null>;
  };
  evidence: { recall: number; correctFieldCount: number };
  errorCode: string | null;
}): SafeOcrObservation;
export function isSafeDiagnosticTempDirectory(directory: string): boolean;
export function cleanupDiagnosticTempDirectory(directory: string): void;
export function callTencentOcr(input: {
  image: Buffer;
  environment: Record<string, string | undefined>;
}): Promise<{
  texts: string[];
  errorCode: string | null;
  timing: { totalDurationMs: number; phases: Record<string, number | null> };
}>;
