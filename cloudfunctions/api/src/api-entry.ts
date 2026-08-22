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
  "customUserId",
  "identityHash",
]);

export interface CloudBaseContextSnapshot {
  OPENID?: unknown;
  openId?: unknown;
  uid?: unknown;
  userInfo?: {
    openId?: unknown;
    uid?: unknown;
  };
}

export interface ApiEntryDependencies {
  registry: ActionRegistry;
  readCloudBaseContext: () =>
    | CloudBaseContextSnapshot
    | Promise<CloudBaseContextSnapshot>;
  idempotency?: {
    service: IdempotencyService;
    createCallerKey: (
      trustedIdentity: string,
      namespace?: "applymate-openid-v1" | "web-anonymous-uid-v1",
    ) => string;
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
  if (Array.isArray(value)) {
    return value.map((child) => stripClientIdentityFields(child));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!CLIENT_IDENTITY_FIELDS.has(key)) {
      result[key] = stripClientIdentityFields(child);
    }
  }
  return result;
}

function sanitizeRequestIdentity(input: unknown): unknown {
  return stripClientIdentityFields(input);
}

function isTrustedIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    hasValidUnicode(value)
  );
}

function resolveTrustedIdentity(cloudContext: CloudBaseContextSnapshot): {
  value: string;
  namespace: "applymate-openid-v1" | "web-anonymous-uid-v1";
} | null {
  const openId = cloudContext.OPENID ?? cloudContext.openId ?? cloudContext.userInfo?.openId;
  if (isTrustedIdentity(openId)) {
    return { value: openId, namespace: "applymate-openid-v1" };
  }
  const uid = cloudContext.uid ?? cloudContext.userInfo?.uid;
  if (isTrustedIdentity(uid)) {
    return { value: uid, namespace: "web-anonymous-uid-v1" };
  }
  return null;
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
      const trustedIdentity = resolveTrustedIdentity(cloudContext);
      if (trustedIdentity === null) {
        return {
          ok: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required.",
            retryable: false,
          },
        };
      }
      const trustedOpenId = trustedIdentity.value;
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
            identityNamespace: trustedIdentity.namespace,
            requestId: parsed.data.requestId,
          },
        );
      };
      if (
        parsed.data.requestId !== undefined &&
        dependencies.idempotency !== undefined
      ) {
        return await dependencies.idempotency.service.execute(
          dependencies.idempotency.createCallerKey(
            trustedOpenId,
            trustedIdentity.namespace,
          ),
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
