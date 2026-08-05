import type { ApiAction, ApiResponse } from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";

export interface ApiExecutionContext {
  trustedOpenId: string;
  requestId: string | undefined;
}

export type ApiActionHandler = (
  payload: Record<string, unknown>,
  context: ApiExecutionContext,
) => Promise<ApiResponse>;

export class ActionRegistry {
  readonly #handlers = new Map<ApiAction, ApiActionHandler>();

  register(action: ApiAction, handler: ApiActionHandler): void {
    if (this.#handlers.has(action)) {
      throw new Error(`Action already registered: ${action}`);
    }
    this.#handlers.set(action, handler);
  }

  async dispatch(
    action: string,
    payload: Record<string, unknown>,
    context: ApiExecutionContext,
  ): Promise<ApiResponse> {
    const handler = this.#handlers.get(action as ApiAction);
    if (handler === undefined) {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Unsupported action.",
          retryable: false,
        },
      };
    }

    try {
      return await handler(payload, context);
    } catch (error) {
      if (error instanceof DomainError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred.",
          retryable: false,
        },
      };
    }
  }
}
