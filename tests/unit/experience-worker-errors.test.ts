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

  it("returns an actionable message when an uploaded file cannot be read", () => {
    expect(publicProcessingError(new Error("FILE_PROCESSING_FAILED"))).toEqual({
      code: "FILE_PROCESSING_FAILED",
      message: "上传文件读取失败，请重新上传后重试。",
      retryable: true,
    });
  });

  it.each([
    ["greeting_length", "AI 返回结构不完整，系统已记录具体校验项，本次不扣额度。"],
    ["match_plan_schema", "AI 返回结构不完整，系统已记录具体校验项，本次不扣额度。"],
    ["cross_jd_domain_term", "AI 生成内容包含无法由简历或岗位信息支持的表述，系统已拦截，本次不扣额度。"],
    ["evidence_strength_mismatch", "AI 生成内容包含无法由简历或岗位信息支持的表述，系统已拦截，本次不扣额度。"],
  ])("does not expose the %s validation gate or source content", (validationGate, message) => {
    const error = Object.assign(new Error("MODEL_INVALID_OUTPUT"), {
      validationGate,
      sourceContent: "private resume and JD content",
    });

    const result = publicProcessingError(error);

    expect(result).toEqual({
      code: "MODEL_INVALID_OUTPUT",
      message,
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain(validationGate);
    expect(JSON.stringify(result)).not.toContain("private resume and JD content");
  });
});
