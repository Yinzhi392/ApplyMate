import { describe, expect, it, vi } from "vitest";

import {
  ResumeParsePipeline,
  ResumeStructureParser,
} from "../../cloudfunctions/worker/src/index.js";

const MODEL_OUTPUT = {
  name: "赵同学",
  education: [],
  experiences: [],
  projects: [],
  skills: [{ name: "TypeScript", text: "熟悉TypeScript" }],
  languages: [],
  certificates: [],
  achievements: [],
  otherFacts: [],
};

function createPipeline(modelCalls: string[]) {
  const parser = new ResumeStructureParser({
    parseStructuredResume: async (maskedText) => {
      modelCalls.push(maskedText);
      return MODEL_OUTPUT;
    },
  });
  return new ResumeParsePipeline({
    files: {
      readValidatedFile: async (_ownerUserId, fileId) => ({
        fileId,
        bytes: Buffer.from(fileId),
      }),
    },
    docx: { extract: vi.fn(async () => "DOCX正文") },
    pdf: { extract: vi.fn(async () => ({ pageCount: 1, text: "PDF正文" })) },
    ocr: {
      recognize: vi.fn(async (_ownerUserId, fileId) => ({
        text:
          fileId === "image_1"
            ? "第一页 手机13812345678"
            : "第二页 邮箱candidate@example.com",
        confidence: 0.99,
        providerRequestId: fileId,
        durationMs: 1,
        usageUnits: 1,
      })),
    },
    parser,
  });
}

describe("ResumeParsePipeline", () => {
  it("extracts ordered OCR text and only sends masked text to the model", async () => {
    const modelCalls: string[] = [];
    const pipeline = createPipeline(modelCalls);
    const extracted = await pipeline.extract({
      resumeId: "resume_pipeline_01",
      userId: "user_pipeline",
      inputType: "images",
      temporaryFileIds: ["image_1", "image_2"],
    });
    const parsed = await pipeline.parseExtracted(
      extracted,
      "resume_pipeline_01",
    );

    expect(extracted).toContain("第一页");
    expect(extracted.indexOf("第一页")).toBeLessThan(extracted.indexOf("第二页"));
    expect(modelCalls[0]).not.toContain("13812345678");
    expect(modelCalls[0]).not.toContain("candidate@example.com");
    expect(modelCalls[0]).toContain("[MASKED:phone]");
    expect(parsed.profile).toMatchObject({
      resumeId: "resume_pipeline_01",
      confirmed: false,
    });
    expect(parsed.maskedCount).toBe(2);
  });

  it("routes text, PDF, and DOCX through the same text boundary", async () => {
    const modelCalls: string[] = [];
    const pipeline = createPipeline(modelCalls);

    await expect(
      pipeline.extract({
        resumeId: "resume_text_01",
        userId: "user_pipeline",
        inputType: "text",
        temporaryFileIds: [],
        sourceText: "粘贴文本",
      }),
    ).resolves.toBe("粘贴文本");
    await expect(
      pipeline.extract({
        resumeId: "resume_pdf_01",
        userId: "user_pipeline",
        inputType: "pdf",
        temporaryFileIds: ["pdf_1"],
      }),
    ).resolves.toBe("PDF正文");
    await expect(
      pipeline.extract({
        resumeId: "resume_docx_01",
        userId: "user_pipeline",
        inputType: "docx",
        temporaryFileIds: ["docx_1"],
      }),
    ).resolves.toBe("DOCX正文");
    await expect(
      pipeline.extract({
        resumeId: "resume_too_long",
        userId: "user_pipeline",
        inputType: "text",
        temporaryFileIds: [],
        sourceText: "字".repeat(20_001),
      }),
    ).rejects.toMatchObject({ code: "EXTRACTED_TEXT_INVALID" });
  });
});
