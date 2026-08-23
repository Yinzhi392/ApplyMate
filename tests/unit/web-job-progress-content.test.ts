import { describe, expect, it } from "vitest";

import { createJobProgressContent } from "../../web/src/features/jobs/job-progress";

describe("web job progress content", () => {
  it("shows resume-specific copy and stages for resume parsing", () => {
    expect(createJobProgressContent("resume_parse", "parsing")).toEqual({
      title: "正在解析简历",
      stages: ["读取简历文件", "提取简历文字", "整理待核对事实"],
      activeIndex: 2,
    });
  });

  it("does not mark all resume stages complete after a failure", () => {
    expect(createJobProgressContent("resume_parse", "failed", "ocr")).toMatchObject({
      title: "简历解析未完成",
      activeIndex: 1,
    });
  });

  it("keeps generation-specific copy for greeting jobs", () => {
    expect(createJobProgressContent("greeting_generate", "generating")).toMatchObject({
      title: "正在生成开场白",
      stages: ["读取岗位输入", "识别岗位职责与要求", "匹配简历事实并生成"],
      activeIndex: 2,
    });
  });

  it("marks a parsed resume ready for one-time review", () => {
    expect(createJobProgressContent("resume_parse", "awaiting_user_confirmation")).toMatchObject({
      title: "正在解析简历",
      activeIndex: 2,
    });
  });
});
