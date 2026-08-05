import {
  ApiRequestSchema,
  type ApiResponse,
  hasValidUnicode,
} from "../../../shared/src/index.js";

import { type ActionRegistry } from "./action-registry.js";

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

    return dependencies.registry.dispatch(
      parsed.data.action,
      parsed.data.payload,
      {
        trustedOpenId: cloudContext.OPENID,
        requestId: parsed.data.requestId,
      },
    );
  };
}
