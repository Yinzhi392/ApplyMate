import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { publicProcessingError } = require(
  "../../cloudfunctions/worker/deploy/experience-worker.js",
) as {
  publicProcessingError: (error: Error) => {
    code: string;
    message: string;
    retryable: boolean;
  };
};

describe("experience worker public errors", () => {
  it("returns an actionable non-retryable message for missing OCR credentials", () => {
    expect(publicProcessingError(new Error("OCR_CREDENTIALS_MISSING"))).toEqual({
      code: "OCR_CREDENTIALS_MISSING",
      message: "图片识别服务配置未完成，请联系管理员。",
      retryable: false,
    });
  });

  it("does not leak unknown internal error text", () => {
    expect(publicProcessingError(new Error("secret internal detail"))).toEqual({
      code: "PROCESSING_FAILED",
      message: "AI 处理失败，请稍后重试。",
      retryable: true,
    });
  });
});
