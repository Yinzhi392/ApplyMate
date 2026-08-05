import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  ApiRequestSchema,
  ApiResponseSchema,
} from "../../shared/src/index.js";

describe("API contract", () => {
  it("requires a UUID requestId for writes", () => {
    expect(
      ApiRequestSchema.safeParse({
        action: "resume.confirm",
        payload: { resumeId: "resume_demo1234" },
      }).success,
    ).toBe(false);
    expect(
      ApiRequestSchema.safeParse({
        action: "resume.confirm",
        payload: { resumeId: "resume_demo1234" },
        requestId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      ApiRequestSchema.safeParse({
        action: "resume.confirm",
        payload: { resumeId: "resume_demo1234" },
        requestId: "123e4567-e89b-42d3-a456-426614174000",
      }).success,
    ).toBe(true);
  });

  it("allows reads to omit requestId", () => {
    expect(
      ApiRequestSchema.safeParse({
        action: "job.get",
        payload: { jobId: "job_demo1234" },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown actions and oversized payloads", () => {
    expect(
      ApiRequestSchema.safeParse({ action: "generation.get", payload: {} })
        .success,
    ).toBe(false);
    expect(
      ApiRequestSchema.safeParse({
        action: "job.get",
        payload: { value: "字".repeat(20_001) },
      }).success,
    ).toBe(false);
  });

  it("defines strict success and failure responses", () => {
    expect(API_ERROR_CODES).toContain("INVALID_REQUEST");
    expect(ApiResponseSchema.safeParse({ ok: true, data: { jobId: "job_1" } }).success).toBe(
      true,
    );
    expect(
      ApiResponseSchema.safeParse({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Resource not found.",
          retryable: false,
        },
      }).success,
    ).toBe(true);
    expect(
      ApiResponseSchema.safeParse({
        ok: false,
        data: {},
        error: { code: "MADE_UP", message: "bad", retryable: false },
      }).success,
    ).toBe(false);
  });
});
