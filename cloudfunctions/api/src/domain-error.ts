import type { ApiErrorCode } from "../../../shared/src/index.js";

export class DomainError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
