import { describe, expect, it } from "vitest";

import {
  JOB_STATUSES,
  canTransitionJob,
} from "../../shared/src/index.js";

const allowed = new Set([
  "queued->ocr",
  "queued->parsing",
  "queued->failed",
  "ocr->parsing",
  "ocr->failed",
  "parsing->awaiting_user_confirmation",
  "parsing->generating",
  "parsing->succeeded",
  "parsing->failed",
  "awaiting_user_confirmation->generating",
  "awaiting_user_confirmation->succeeded",
  "awaiting_user_confirmation->failed",
  "generating->validating",
  "generating->failed",
  "validating->succeeded",
  "validating->failed",
]);

describe("job status transitions", () => {
  it("uses the fixed status set", () => {
    expect(JOB_STATUSES).toEqual([
      "queued",
      "ocr",
      "parsing",
      "awaiting_user_confirmation",
      "generating",
      "validating",
      "succeeded",
      "failed",
    ]);
  });

  it("exhaustively allows only documented transitions", () => {
    for (const from of JOB_STATUSES) {
      for (const to of JOB_STATUSES) {
        expect(canTransitionJob(from, to), `${from}->${to}`).toBe(
          allowed.has(`${from}->${to}`),
        );
      }
    }
  });

  it("allows text tasks to skip OCR", () => {
    expect(canTransitionJob("queued", "parsing")).toBe(true);
  });

  it("keeps both terminal states terminal", () => {
    for (const to of JOB_STATUSES) {
      expect(canTransitionJob("succeeded", to)).toBe(false);
      expect(canTransitionJob("failed", to)).toBe(false);
    }
  });
});
