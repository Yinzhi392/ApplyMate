import { describe, expect, it } from "vitest";

import { GenerationCreatePayloadSchema } from "../../cloudfunctions/api/src/generation-domain.js";
import { ResumeParsePayloadSchema } from "../../cloudfunctions/api/src/resume-domain.js";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `file_${index + 1}`);

describe("generation and resume image limits", () => {
  it("accepts five JD screenshots and rejects the sixth", () => {
    expect(GenerationCreatePayloadSchema.safeParse({
      inputType: "images",
      resumeId: "resume_demo0001",
      fileIds: ids(5),
    }).success).toBe(true);
    expect(GenerationCreatePayloadSchema.safeParse({
      inputType: "images",
      resumeId: "resume_demo0001",
      fileIds: ids(6),
    }).success).toBe(false);
  });

  it("continues to accept six resume screenshots", () => {
    expect(ResumeParsePayloadSchema.safeParse({
      inputType: "images",
      fileIds: ids(6),
    }).success).toBe(true);
  });
});
