import { describe, expect, it } from "vitest";

import {
  appendJdImages,
  buildActiveGenerationInput,
  createPreferenceDraft,
  moveItem,
  removeJdImage,
  reorderJdImage,
  updateGenerationDraft,
  validateJdImageSelection,
  validateResumeImageSelection,
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

  it("keeps the resume limit at six while rejecting a sixth JD screenshot", () => {
    const sixImages = Array.from({ length: 6 }, (_, index) => ({
      path: `${index}.jpg`,
      size: 1,
    }));

    expect(validateResumeImageSelection(sixImages)).toEqual({ valid: true });
    expect(validateJdImageSelection(sixImages)).toMatchObject({
      valid: false,
      message: "岗位截图最多选择 5 张。",
    });
  });

  it("checks aggregate image size before upload", () => {
    expect(validateResumeImageSelection([
      { path: "a.jpg", size: 4 * 1024 * 1024 },
      { path: "b.png", size: 6 * 1024 * 1024 },
    ])).toEqual({ valid: true });
    expect(validateResumeImageSelection([
      { path: "a.jpg", size: 6 * 1024 * 1024 },
      { path: "b.png", size: 5 * 1024 * 1024 },
    ])).toMatchObject({ valid: false, message: "图片总大小不能超过 10MB。" });
  });

  it("keeps JD images in the user-defined order", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("appends JD screenshots in batches up to five and supports continuing later", () => {
    const start = {
      inputMode: "images" as const,
      images: [{ path: "1.jpg", size: 1 }, { path: "2.jpg", size: 1 }],
      requestId: "old-request",
      resumeIndex: 0,
      text: "保留的文字草稿",
    };
    const completed = appendJdImages(start, [
      { path: "3.jpg", size: 1 },
      { path: "4.jpg", size: 1 },
      { path: "5.jpg", size: 1 },
    ]);

    expect(completed).toMatchObject({
      valid: true,
      draft: { images: [
        { path: "1.jpg", size: 1 },
        { path: "2.jpg", size: 1 },
        { path: "3.jpg", size: 1 },
        { path: "4.jpg", size: 1 },
        { path: "5.jpg", size: 1 },
      ], requestId: "", text: "保留的文字草稿" },
    });
    expect(appendJdImages(completed.draft, [{ path: "6.jpg", size: 1 }])).toMatchObject({
      valid: false,
      message: "岗位截图最多选择 5 张。",
      draft: completed.draft,
    });
  });

  it("deletes and reorders screenshots without losing either input draft", () => {
    const start = {
      inputMode: "images" as const,
      images: ["a", "b", "c"].map((path) => ({ path, size: 1 })),
      requestId: "old-request",
      resumeIndex: 1,
      text: "岗位文字草稿",
    };

    const removed = removeJdImage(start, 1);
    const reordered = reorderJdImage(removed, 1, 0);
    const switched = updateGenerationDraft(reordered, { inputMode: "text" });

    expect(switched).toMatchObject({
      inputMode: "text",
      images: [{ path: "c", size: 1 }, { path: "a", size: 1 }],
      requestId: "",
      resumeIndex: 1,
      text: "岗位文字草稿",
    });
  });

  it("submits only the active mode and resets requestId for every draft change", () => {
    const base = {
      inputMode: "images" as const,
      images: [{ path: "a.jpg", size: 1 }],
      requestId: "old-request",
      resumeIndex: 0,
      text: "岗位文字草稿",
    };

    expect(buildActiveGenerationInput(base)).toEqual({
      inputType: "images",
      fileIds: ["demo:a.jpg"],
    });
    const textMode = updateGenerationDraft(base, { inputMode: "text", resumeIndex: 2 });
    expect(textMode.requestId).toBe("");
    expect(buildActiveGenerationInput(textMode)).toEqual({
      inputType: "text",
      text: "岗位文字草稿",
    });
    expect(updateGenerationDraft({ ...base, requestId: "retry" }, { text: "已修改" }).requestId)
      .toBe("");
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
