import { describe, expect, it } from "vitest";

import {
  type OcrProviderInput,
  ResumePrivacyGateway,
  TencentOcrAdapter,
  type ValidatedImageFile,
} from "../../cloudfunctions/worker/src/index.js";

const OWNER_ID = "user_owner";
const RAW_TEXT = [
  "王小明",
  "手机 13812345678",
  "邮箱 candidate@example.com",
  "身份证 110105199001011234",
  "护照 E12345678",
  "地址 北京市朝阳区建国路88号1栋",
].join("\n");

describe("resume privacy egress chain", () => {
  it("sends image bytes only to OCR and masked text only to TokenHub", async () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const validatedFile: ValidatedImageFile = {
      fileId: "file_image",
      ownerUserId: OWNER_ID,
      mimeType: "image/png",
      bytes: image,
      validatedKind: "images",
    };
    const ocrCalls: OcrProviderInput[] = [];
    const modelCalls: string[] = [];
    const ocr = new TencentOcrAdapter(
      {
        getValidatedImage: async () => validatedFile,
      },
      {
        recognize: async (input) => {
          ocrCalls.push(input);
          return {
            text: RAW_TEXT,
            confidence: 0.99,
            providerRequestId: "ocr_request_1",
            durationMs: 10,
            usageUnits: 1,
          };
        },
      },
    );
    const privacy = new ResumePrivacyGateway({
      parseResumeText: async (text) => {
        modelCalls.push(text);
        return { accepted: true };
      },
    });

    const recognized = await ocr.recognize(OWNER_ID, "file_image");
    const result = await privacy.parseResumeText(recognized.text);

    expect(ocrCalls).toHaveLength(1);
    expect(ocrCalls[0]?.bytes).toEqual(image);
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).not.toContain("13812345678");
    expect(modelCalls[0]).not.toContain("candidate@example.com");
    expect(modelCalls[0]).not.toContain("110105199001011234");
    expect(modelCalls[0]).not.toContain("E12345678");
    expect(modelCalls[0]).not.toContain("北京市朝阳区建国路88号1栋");
    expect(modelCalls[0]).toContain("[MASKED:phone]");
    expect(modelCalls[0]).toContain("[MASKED:email]");
    expect(modelCalls[0]).toContain("[MASKED:nationalId]");
    expect(modelCalls[0]).toContain("[MASKED:documentNumber]");
    expect(modelCalls[0]).toContain("[MASKED:detailedAddress]");
    expect(result.value).toEqual({ accepted: true });
    expect(result.maskedTypes).toEqual([
      "phone",
      "email",
      "nationalId",
      "documentNumber",
      "detailedAddress",
    ]);
    expect(result.maskedCount).toBe(5);
    expect(JSON.stringify(result)).not.toContain("13812345678");
  });

  it("applies the same masking gate to already extracted text", async () => {
    const calls: string[] = [];
    const privacy = new ResumePrivacyGateway({
      parseResumeText: async (text) => {
        calls.push(text);
        return "parsed";
      },
    });

    await privacy.parseResumeText(RAW_TEXT);

    expect(calls[0]).not.toContain("candidate@example.com");
    expect(calls[0]).toContain("[MASKED:email]");
  });
});
