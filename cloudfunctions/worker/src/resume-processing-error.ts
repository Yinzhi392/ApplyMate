export type ResumeProcessingErrorCode =
  | "INVALID_DOCUMENT"
  | "EMPTY_DOCUMENT"
  | "PDF_PAGE_LIMIT"
  | "SCANNED_PDF"
  | "EXTRACTED_TEXT_INVALID"
  | "OCR_LOW_CONFIDENCE"
  | "OCR_TIMEOUT"
  | "OCR_RATE_LIMITED"
  | "OCR_RESOURCE_PAUSED"
  | "OCR_FAILED"
  | "MODEL_INVALID_OUTPUT"
  | "MODEL_FAILED";

export class ResumeProcessingError extends Error {
  constructor(
    readonly code: ResumeProcessingErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ResumeProcessingError";
  }
}
