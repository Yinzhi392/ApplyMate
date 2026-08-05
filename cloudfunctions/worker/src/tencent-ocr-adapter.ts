import { ResumeProcessingError } from "./resume-processing-error.js";

export const MIN_OCR_CONFIDENCE = 0.8;

export interface ValidatedImageFile {
  fileId: string;
  ownerUserId: string;
  mimeType: string;
  bytes: Buffer;
  validatedKind: "images";
}

export interface ValidatedImageFileReader {
  getValidatedImage(
    ownerUserId: string,
    fileId: string,
  ): Promise<ValidatedImageFile | null>;
}

export interface OcrProviderInput {
  fileId: string;
  mimeType: string;
  bytes: Buffer;
  signal?: AbortSignal;
}

export interface OcrResult {
  text: string;
  confidence: number;
  providerRequestId: string;
  durationMs: number;
  usageUnits: number;
}

export interface OcrProvider {
  recognize(input: OcrProviderInput): Promise<OcrResult>;
}

export type OcrProviderFailure =
  | "timeout"
  | "rate_limited"
  | "resource_paused"
  | "failed";

export class OcrProviderError extends Error {
  constructor(readonly kind: OcrProviderFailure) {
    super("OCR provider request failed.");
    this.name = "OcrProviderError";
  }
}

function normalizeProviderError(error: unknown): ResumeProcessingError {
  if (error instanceof OcrProviderError) {
    switch (error.kind) {
      case "timeout":
        return new ResumeProcessingError(
          "OCR_TIMEOUT",
          "Image recognition timed out.",
          true,
        );
      case "rate_limited":
        return new ResumeProcessingError(
          "OCR_RATE_LIMITED",
          "Image recognition is temporarily busy.",
          true,
        );
      case "resource_paused":
        return new ResumeProcessingError(
          "OCR_RESOURCE_PAUSED",
          "The free OCR resource is temporarily paused.",
          true,
        );
      case "failed":
        break;
    }
  }
  return new ResumeProcessingError(
    "OCR_FAILED",
    "Image recognition failed.",
    true,
  );
}

export class TencentOcrAdapter {
  constructor(
    private readonly files: ValidatedImageFileReader,
    private readonly provider: OcrProvider,
    private readonly minimumConfidence = MIN_OCR_CONFIDENCE,
  ) {}

  async recognize(
    ownerUserId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<OcrResult> {
    const file = await this.files.getValidatedImage(ownerUserId, fileId);
    if (file === null || file.ownerUserId !== ownerUserId) {
      throw new ResumeProcessingError(
        "INVALID_DOCUMENT",
        "The image file was not found.",
      );
    }

    let result: OcrResult;
    try {
      result = await this.provider.recognize({
        fileId: file.fileId,
        mimeType: file.mimeType,
        bytes: Buffer.from(file.bytes),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      throw normalizeProviderError(error);
    }
    if (
      result.text.trim().length === 0 ||
      !Number.isFinite(result.confidence) ||
      result.confidence < this.minimumConfidence
    ) {
      throw new ResumeProcessingError(
        "OCR_LOW_CONFIDENCE",
        "The image is unclear. Upload a clearer screenshot.",
      );
    }
    return { ...result, text: result.text.trim() };
  }
}
