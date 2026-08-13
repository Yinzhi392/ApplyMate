import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AI_COPY_LABEL,
  CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  PRIVACY_POLICY_VERSION,
  USER_AGREEMENT_VERSION,
  renderLegalDocumentPlainText,
} from "../../miniprogram/core/legal-documents.js";

const docsRoot = join(process.cwd(), "docs", "phase-10");

function readDocument(fileName: string): string {
  return readFileSync(join(docsRoot, fileName), "utf8");
}

describe("phase 10 legal document source", () => {
  it("locks the approved versions, contact and AI label", () => {
    expect(USER_AGREEMENT_VERSION).toBe("user-2026-08-09");
    expect(PRIVACY_POLICY_VERSION).toBe("privacy-2026-08-09");
    expect(CONTACT_EMAIL).toBe("applymate67@gmail.com");
    expect(AI_COPY_LABEL).toBe("AI生成内容，请核对真实性");
  });

  it("covers the invited-test data path, retention, rights and AI limitations", () => {
    const allText = LEGAL_DOCUMENTS.map(renderLegalDocumentPlainText).join("\n");

    [
      "CloudBase",
      "腾讯 OCR",
      "TokenHub",
      "原始图片只发送给腾讯 OCR",
      "脱敏文本",
      "24 小时",
      "180 天",
      "删除账号",
      "AI生成内容，请核对真实性",
      "本地演示数据",
      "未经专业法律审查",
      CONTACT_EMAIL,
    ].forEach((requiredText) => expect(allText).toContain(requiredText));
  });

  it("keeps the review markdown aligned with the in-app source", () => {
    const reviewFiles = [
      ["user-agreement-draft.md", "user-agreement"],
      ["privacy-policy-draft.md", "privacy-policy"],
      ["ai-service-disclosure-draft.md", "ai-service"],
    ] as const;

    reviewFiles.forEach(([fileName, documentId]) => {
      const review = readDocument(fileName);
      const document = LEGAL_DOCUMENTS.find(({ id }) => id === documentId);
      expect(document).toBeDefined();
      expect(review).toContain(document!.title);
      expect(review).toContain(document!.version);
      expect(review).toContain(CONTACT_EMAIL);
      document!.sections.forEach(({ heading }) => expect(review).toContain(heading));
    });
  });
});
