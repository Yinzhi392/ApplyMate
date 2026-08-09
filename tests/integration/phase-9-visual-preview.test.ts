import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "docs", "phase-9-v2-preview");

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("phase 9 visual prototype", () => {
  it("ships as a dependency-free repository artifact", () => {
    expect(existsSync(join(root, "index.html"))).toBe(true);
    expect(existsSync(join(root, "styles.css"))).toBe(true);
    expect(existsSync(join(root, "preview.js"))).toBe(true);

    const html = read("index.html");
    expect(html).toContain("阶段 9 · 13 页视觉稿");
    expect(html).toContain("THESIS:");
    expect(html).not.toMatch(/https?:\/\//u);
  });

  it("covers all thirteen independently named screens without a JD confirmation step", () => {
    const script = read("preview.js");
    const screenIds = [
      "login",
      "home",
      "resumes",
      "resume-upload",
      "resume-edit",
      "preferences",
      "generation",
      "job",
      "result",
      "records",
      "application-detail",
      "mine",
      "admin",
    ];

    screenIds.forEach((screenId) => expect(script, screenId).toContain(`\"${screenId}\"`));
    expect(script).toContain("const renderers = {");
    expect(script).toContain("login: renderLogin");
    expect(script).toContain("admin: renderAdmin");
    expect(script).toContain('header("你好，同学"');
    expect(script).not.toContain('"jd-confirm"');
    expect(script).not.toContain("renderJdConfirm");
    expect(script).not.toContain("确认岗位信息");
  });

  it("includes the agreed interactive review states", () => {
    const script = read("preview.js");
    expect(script).toContain('loginMode: "first"');
    expect(script).toContain('["success", "成功"]');
    expect(script).toContain('["disabled", "禁用"]');
    expect(script).toContain('["returning", "老用户直达"]');
    expect(script).toContain('submit.disabled = true');
    expect(script).toContain('data-input-mode="image"');
    expect(script).toContain('data-action="toggle-disclosure"');
    expect(script).toContain('data-record-filter="all"');
    expect(script).toContain("APPLYMATE");
  });

  it("keeps resume confirmation lightweight while AI ranks confirmed facts", () => {
    const script = read("preview.js");

    expect(script).toContain('["resume-edit", "核对个人资料"]');
    expect(script).toContain('header("核对个人资料"');
    expect(script).toContain("AI 负责排序，你只需纠正事实");
    expect(script).toContain("本次最有价值的 3 项");
    expect(script).toContain("市场基准权重");
    expect(script).toContain("相关实习 / 工作经历");
    expect(script).toContain("相关项目与量化成果");
    expect(script).toContain("专业技能与工具");
    expect(script).toContain("有经历支撑的个人能力");
    expect(script).toContain("教育背景与专业匹配");
    expect(script).toContain("证书、语言、奖项与领导经历");
    expect(script).toContain("GPA / 均分");
    expect(script).toContain("25%");
    expect(script).toContain("20%");
    expect(script).toContain("15%");
    expect(script).toContain("8%");
    expect(script).toContain("5%");
    expect(script).toContain("2%");
    expect(script).toContain("data-action=\"mark-fact-correct\"");
    expect(script).toContain("需核对");
    expect(script).toContain("后续提交岗位时，AI 会按 JD 自动重新排序，无需再次确认简历");
  });

  it("locks the calm efficiency design constraints", () => {
    const styles = read("styles.css");
    const script = read("preview.js");
    expect(styles).toContain("--page-gutter: 16px");
    expect(styles).toContain("--section-gap: 24px");
    expect(styles).toContain("--content-gap: 10px");
    expect(styles).toContain("--control-height: 44px");
    expect(styles).toContain("--glass-surface");
    expect(styles).toContain(".glass-panel");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).not.toContain("backdrop-filter");
    expect(styles).not.toContain("linear-gradient");
    expect(script).toContain("继续投下一个岗位");
    expect(script).toContain("返回首页");
    expect(script).toContain('data-action="resume-menu"');
    expect(script.match(/添加一份简历/gu)).toHaveLength(1);
  });
});
