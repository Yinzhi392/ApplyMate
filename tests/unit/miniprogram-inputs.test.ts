import { describe, expect, it } from "vitest";

import {
  createPreferenceDraft,
  moveItem,
  validateImageSelection,
  validateResumeDocument,
} from "../../miniprogram/core/input-rules.js";

describe("mini-program input rules", () => {
  it("checks PDF and DOCX file size before upload", () => {
    expect(validateResumeDocument({ name: "resume.pdf", size: 10 * 1024 * 1024 })).toEqual({
      valid: true,
      kind: "pdf",
    });
    expect(validateResumeDocument({ name: "resume.doc", size: 100 })).toMatchObject({
      valid: false,
      message: "暂不支持 DOC，请另存为 DOCX 或 PDF。",
    });
    expect(validateResumeDocument({ name: "resume.docx", size: 10 * 1024 * 1024 + 1 })).toMatchObject({
      valid: false,
      message: "单个文件不能超过 10MB。",
    });
  });

  it("checks image count and aggregate size before upload", () => {
    expect(validateImageSelection([
      { path: "a.jpg", size: 4 * 1024 * 1024 },
      { path: "b.png", size: 6 * 1024 * 1024 },
    ])).toEqual({ valid: true });
    expect(validateImageSelection(Array.from({ length: 7 }, (_, index) => ({
      path: `${index}.jpg`,
      size: 1,
    })))).toMatchObject({ valid: false, message: "最多选择 6 张图片。" });
    expect(validateImageSelection([
      { path: "a.jpg", size: 6 * 1024 * 1024 },
      { path: "b.png", size: 5 * 1024 * 1024 },
    ])).toMatchObject({ valid: false, message: "图片总大小不能超过 10MB。" });
  });

  it("keeps JD images in the user-defined order", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("counts preference text and previews the server-compatible sentences", () => {
    expect(createPreferenceDraft("希望远程。可立即到岗\n每周 4 天")).toMatchObject({
      visibleCharacters: 14,
      valid: true,
      segments: ["希望远程", "可立即到岗", "每周 4 天"],
    });
    expect(createPreferenceDraft("好".repeat(501))).toMatchObject({
      visibleCharacters: 501,
      valid: false,
    });
  });
});
