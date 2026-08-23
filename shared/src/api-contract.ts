import { z } from "zod";

import { countVisibleCharacters, hasValidUnicode } from "./text.js";

export const API_ACTIONS = [
  "auth.status",
  "agreement.accept",
  "invite.activate",
  "user.get",
  "user.updatePreferences",
  "user.export",
  "user.delete",
  "resume.parse",
  "resume.confirm",
  "resume.list",
  "resume.setDefault",
  "resume.delete",
  "generation.create",
  "generation.rewrite",
  "job.get",
  "application.list",
  "application.get",
  "application.update",
  "application.delete",
  "feedback.submit",
  "analytics.track",
  "admin.inviteCreate",
  "admin.inviteRevoke",
  "admin.userSetEnabled",
  "admin.quotaAdjust",
  "admin.stats",
] as const;

export type ApiAction = (typeof API_ACTIONS)[number];

export const READ_API_ACTIONS = [
  "auth.status",
  "user.get",
  "user.export",
  "resume.list",
  "job.get",
  "application.list",
  "application.get",
  "admin.stats",
] as const satisfies readonly ApiAction[];

const READ_ACTION_SET = new Set<ApiAction>(READ_API_ACTIONS);
export const MAX_API_PAYLOAD_VISIBLE_CHARACTERS = 20_000;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function containsForbiddenObjectKey(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return value.some((child) => containsForbiddenObjectKey(child, seen));
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    return true;
  }

  return Object.entries(value).some(
    ([key, child]) =>
      FORBIDDEN_OBJECT_KEYS.has(key) || containsForbiddenObjectKey(child, seen),
  );
}

function containsInvalidUnicode(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof value === "string") {
    return !hasValidUnicode(value);
  }
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return false;
  }
  seen.add(value);

  return Object.entries(value).some(
    ([key, child]) => !hasValidUnicode(key) || containsInvalidUnicode(child, seen),
  );
}

const RawSafePayloadSchema = z.unknown().superRefine((payload, context) => {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    context.addIssue({ code: "custom", message: "API payload must be an object." });
    return;
  }
  if (containsForbiddenObjectKey(payload)) {
    context.addIssue({
      code: "custom",
      message: "API payload contains a forbidden object key.",
    });
  }
  if (containsInvalidUnicode(payload)) {
    context.addIssue({
      code: "custom",
      message: "API payload contains invalid Unicode.",
    });
  }

  try {
    if (
      countVisibleCharacters(JSON.stringify(payload)) > MAX_API_PAYLOAD_VISIBLE_CHARACTERS
    ) {
      context.addIssue({ code: "custom", message: "API payload is too large." });
    }
  } catch {
    context.addIssue({ code: "custom", message: "API payload must be JSON-safe." });
  }
});

export const SafePayloadSchema = RawSafePayloadSchema.pipe(
  z.record(z.string(), z.json()),
);

const RequestIdSchema = z.string().uuid();

export const ApiRequestSchema = z
  .object({
    action: z.enum(API_ACTIONS),
    payload: SafePayloadSchema,
    requestId: RequestIdSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (!READ_ACTION_SET.has(request.action) && request.requestId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["requestId"],
        message: "Write actions require a UUID requestId.",
      });
    }
  });

export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "AGREEMENT_REQUIRED",
  "INVITE_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "LIMIT_EXCEEDED",
  "MONTHLY_BUDGET_EXHAUSTED",
  "SERVICE_READ_ONLY",
  "ACTIVE_JOB_EXISTS",
  "RATE_LIMITED",
  "RESOURCE_PAUSED",
  "JOB_FAILED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorSchema = z
  .object({
    code: z.enum(API_ERROR_CODES),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
    details: SafePayloadSchema.optional(),
  })
  .strict();

const ApiSuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    data: z.json().optional(),
  })
  .strict();

const ApiFailureResponseSchema = z
  .object({
    ok: z.literal(false),
    error: ApiErrorSchema,
  })
  .strict();

export const ApiResponseSchema = z.discriminatedUnion("ok", [
  ApiSuccessResponseSchema,
  ApiFailureResponseSchema,
]);

export type ApiRequest = z.infer<typeof ApiRequestSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
