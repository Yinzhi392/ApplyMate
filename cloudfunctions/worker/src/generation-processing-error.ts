export type GenerationProcessingErrorCode =
  | "JD_TEXT_INVALID"
  | "MODEL_INVALID_OUTPUT"
  | "MODEL_FAILED";

export class GenerationProcessingError extends Error {
  constructor(
    readonly code: GenerationProcessingErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GenerationProcessingError";
  }
}

