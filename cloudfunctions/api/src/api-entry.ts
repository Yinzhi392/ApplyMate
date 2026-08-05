import {
  ApiRequestSchema,
  type ApiAction,
  type ApiResponse,
  hasValidUnicode,
} from "../../../shared/src/index.js";

import { type ActionRegistry } from "./action-registry.js";
import { DomainError } from "./domain-error.js";
import type { IdempotencyService } from "./idempotency-service.js";
import type {
  FreeResource,
  ResourceGateService,
} from "./resource-gate-service.js";

const CLIENT_IDENTITY_FIELDS = new Set([
  "OPENID",
  "openid",
  "openId",
  "userId",
  "uid",
]);

export interface CloudBaseContextSnapshot {
  OPENID?: unknown;
}

export interface ApiEntryDependencies {
  registry: ActionRegistry;
  readCloudBaseContext: () =>
    | CloudBaseContextSnapshot
    | Promise<CloudBaseContextSnapshot>;
  idempotency?: {
    service: IdempotencyService;
    createCallerKey: (trustedOpenId: string) => string;
    now: () => Date;
  };
  resourceGate?: {
    service: ResourceGateService;
    resolveRequirements: (
      action: ApiAction,
      payload: Record<string, unknown>,
    ) => readonly FreeResource[];
  };
}

function stripClientIdentityFields(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!CLIENT_IDENTITY_FIELDS.has(key)) {
      result[key] = child;
    }
  }
  return result;
}

function sanitizeRequestIdentity(input: unknown): unknown {
  const envelope = stripClientIdentityFields(input);
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  ) {
    return envelope;
  }

  return {
    ...envelope,
    payload: stripClientIdentityFields(
      (envelope as Record<string, unknown>).payload,
    ),
  };
}

function isTrustedOpenId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    hasValidUnicode(value)
  );
}

export function createApiEntry(
  dependencies: ApiEntryDependencies,
): (event: unknown) => Promise<ApiResponse> {
  return async (event) => {
    const parsed = ApiRequestSchema.safeParse(sanitizeRequestIdentity(event));
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request.",
          retryable: false,
        },
      };
    }

    try {
      const cloudContext = await dependencies.readCloudBaseContext();
      if (!isTrustedOpenId(cloudContext.OPENID)) {
        return {
          ok: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required.",
            retryable: false,
          },
        };
      }
      const trustedOpenId = cloudContext.OPENID;
      const dispatch = () => {
        if (dependencies.resourceGate !== undefined) {
          dependencies.resourceGate.service.assertAvailable(
            dependencies.resourceGate.resolveRequirements(
              parsed.data.action,
              parsed.data.payload,
            ),
          );
        }
        return dependencies.registry.dispatch(
          parsed.data.action,
          parsed.data.payload,
          {
            trustedOpenId,
            requestId: parsed.data.requestId,
          },
        );
      };
      if (
        parsed.data.requestId !== undefined &&
        dependencies.idempotency !== undefined
      ) {
        return await dependencies.idempotency.service.execute(
          dependencies.idempotency.createCallerKey(trustedOpenId),
          parsed.data.action,
          parsed.data.requestId,
          parsed.data.payload,
          dependencies.idempotency.now,
          dispatch,
        );
      }
      return await dispatch();
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
  };
}
