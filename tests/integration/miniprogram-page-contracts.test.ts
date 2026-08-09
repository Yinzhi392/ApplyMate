import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGE_ROUTES, TAB_ROUTES } from "../../miniprogram/core/routes.js";

const root = join(process.cwd(), "miniprogram");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("native mini-program page contracts", () => {
  it("keeps app.json aligned with the route manifest and three-tab navigation", () => {
    const app = JSON.parse(read("app.json")) as {
      pages: string[];
      tabBar: {
        color: string;
        selectedColor: string;
        list: Array<{ pagePath: string; text: string }>;
      };
      window: { navigationBarBackgroundColor: string };
    };

    expect(app.pages).toEqual(PAGE_ROUTES);
    expect(app.tabBar.list.map(({ pagePath, text }) => ({ pagePath, text }))).toEqual(TAB_ROUTES);
    expect(app.window.navigationBarBackgroundColor).toBe("#f2f4ef");
    expect(app.tabBar.color).toBe("#53676b");
    expect(app.tabBar.selectedColor).toBe("#26766c");
  });

  it.each([
    ["pages/login/index.wxml", ["验证成功", "用户协议", "隐私政策", "邀请码"]],
    ["pages/home/index.wxml", ["你好，同学 👋", "当前简历", "今日剩余", "primaryActionLabel"]],
    ["pages/resumes/index.wxml", ["我的简历", "添加一份简历", "openResumeActions"]],
    ["pages/generation/index.wxml", ["添加截图", "粘贴文字", "最多 5 张"]],
    ["pages/result/index.wxml", ["专属开场白", "复制开场白", "继续投下一个岗位", "返回首页"]],
    ["pages/records/index.wxml", ["未投递", "已投递", "暂无投递记录"]],
    ["pages/mine/index.wxml", ["求职偏好", "协议与隐私", "删除账号"]],
  ])("renders the approved core copy in %s", (file, labels) => {
    const content = read(file);
    labels.forEach((label) => expect(content).toContain(label));
  });

  it("keeps recent applications in records instead of the home page", () => {
    expect(read("pages/home/index.wxml")).not.toContain("最近记录");
    expect(read("pages/home/index.ts")).not.toContain("application.list");
    expect(read("pages/records/index.wxml")).toContain("投递记录");
  });

  it("uses the approved balanced home composition", () => {
    const template = read("pages/home/index.wxml");
    const styles = read("pages/home/index.wxss");

    expect(template).toContain("home-hero");
    expect(template).toContain('class="home-journey glass-surface"');
    expect(styles).toMatch(/\.home-page\s*\{[^}]*display:\s*flex/isu);
    expect(styles).toMatch(/\.home-launch-section\s*\{[^}]*width:\s*100%/isu);
    expect(styles).toMatch(/\.primary-launch\s*\{[^}]*width:\s*100%/isu);
    expect(styles).toMatch(/\.home-journey\s*\{[^}]*margin-top:\s*32rpx/isu);
    expect(styles).not.toMatch(/\.home-journey\s*\{[^}]*margin-top:\s*auto/isu);
    expect(styles).toMatch(/\.journey-grid\s*\{[^}]*flex-direction:\s*column/isu);
    expect(template).toContain('<view\n        class="text-action home-manage"');
    expect(template).not.toContain('<button class="text-action home-manage"');
    expect(styles).toMatch(/\.home-manage\s*\{[^}]*position:\s*absolute[^}]*right:\s*34rpx/isu);
    expect(styles).toMatch(/\.home-hero \.subtitle\s*\{[^}]*white-space:\s*nowrap/isu);
  });

  it("keeps resume actions in one contextual menu and a single add entry", () => {
    const template = read("pages/resumes/index.wxml");
    const controller = read("pages/resumes/index.ts");

    expect(template.match(/添加一份简历/gu)).toHaveLength(1);
    expect(template).toContain('bindtap="openResumeActions"');
    expect(template).not.toContain('bindtap="deleteResume"');
    expect(template).not.toContain('bindtap="setDefault"');
    expect(controller).toContain("wx.showActionSheet");
  });

  it("ships thirteen pages and no JD confirmation surface", () => {
    expect(PAGE_ROUTES).toHaveLength(13);
    expect(PAGE_ROUTES).not.toContain("pages/jd-confirm/index");
    expect(read("pages/job/index.ts")).not.toContain("jd-confirm");
    expect(read("services/api-client.ts")).not.toContain("generation.confirmJd");
  });

  it("renders the lightweight one-time resume review structure", () => {
    const template = read("pages/resume-edit/index.wxml");
    const styles = read("pages/resume-edit/index.wxss");
    expect(template).toContain("核对个人资料");
    expect(template).toContain("本次最有价值的 3 项");
    expect(template).toContain("市场基准权重");
    expect(template).toContain("需要你核对");
    expect(template).toContain('class="mini-action edit-action"');
    expect(template).toContain('class="mini-action delete-action"');
    expect(template).not.toContain("事实标识");
    expect(styles).toMatch(/\.review-actions\s*\{[^}]*flex-wrap:\s*nowrap/isu);
    expect(styles).toMatch(/\.mini-action\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/isu);
    expect(styles).toMatch(/\.mini-action\s*\{[^}]*width:\s*0[^}]*flex:\s*1\s+1\s+0%/isu);
  });

  it("keeps resume upload simple while preserving all four supported input types", () => {
    const template = read("pages/resume-upload/index.wxml");
    const controller = read("pages/resume-upload/index.ts");

    expect(template).toContain("上传文件");
    expect(template).toContain("粘贴文字");
    expect(template).toContain("选择 PDF 或 DOCX");
    expect(template).toContain("改用简历图片");
    expect(template).not.toContain("input-type-grid");
    expect(controller).toContain('"pdf" | "docx" | "images"');
    expect(controller).toMatch(/\bchangeResumeMode\s*\(/u);
    expect(controller.match(/\/cancel\/u/gu)).toHaveLength(2);
  });

  it("keeps the native login composition and checkbox state aligned with the approved preview", () => {
    const template = read("pages/login/index.wxml");
    const styles = read("pages/login/index.wxss");
    const config = JSON.parse(read("pages/login/index.json")) as {
      navigationStyle?: string;
    };

    expect(config.navigationStyle).toBe("custom");
    expect(template).toContain("checkbox-group");
    expect(template).toContain('bindchange="changeAgreement"');
    expect(template).not.toContain('bindtap="toggleAgreement"');
    expect(template).not.toContain("APPLYMATE · 投了吗");
    expect(template).not.toContain("本地验证邀请码");
    expect(template).not.toContain("login-shell");
    expect(template).toContain('class="login-content"');
    expect(template).toContain('class="login-intro"');
    expect(template).toContain('class="login-form glass-surface"');
    expect(template.indexOf('class="login-intro"')).toBeLessThan(
      template.indexOf('class="login-form glass-surface"'),
    );
    expect(styles).not.toMatch(/\.login-shell\b/u);
    expect(styles).toMatch(/\.login-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/isu);
    expect(styles).toMatch(/\.login-content\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*justify-content:\s*center/isu);
    expect(styles).toMatch(/\.login-intro\s*\{[^}]*padding:\s*0\s+4rpx\s+32rpx/isu);
    expect(styles).toMatch(/\.login-intro \.title\s*\{[^}]*font-size:\s*50rpx/isu);
    expect(styles).toMatch(/\.brand-symbol\s*\{[^}]*margin-bottom:\s*44rpx/isu);
    expect(styles).toMatch(
      /\.login-form\s*\{[^}]*gap:\s*24rpx[^}]*padding:\s*32rpx/isu,
    );
    expect(styles).toMatch(/\.login-action\s*\{[^}]*width:\s*100%/isu);
    expect(styles).not.toMatch(/\.login-page\s*\{[^}]*justify-content:\s*center/isu);
  });

  it("uses restrained native emoji accents without leaving empty menu gutters", () => {
    const mine = read("pages/mine/index.wxml");
    const mineStyles = read("pages/mine/index.wxss");

    expect(mine).toContain("我的 👋");
    expect(mine.match(/class="menu-icon(?: [^"]*)?"/gu)).toHaveLength(4);
    expect(mine.match(/class="menu-row-content"/gu)).toHaveLength(4);
    expect(mine).toContain("📄");
    expect(mine).toContain("🎯");
    expect(mine).toContain("🔒");
    expect(mine).toContain("🗑️");
    expect(mine.match(/<view\n        class="list-row profile-menu-row/gu)).toHaveLength(4);
    expect(mine).not.toContain('<button class="list-row profile-menu-row"');
    expect(mineStyles).toMatch(/\.profile-menu-row\s*\{[^}]*display:\s*block/isu);
    expect(mineStyles).toMatch(/\.menu-row-content\s*\{[^}]*display:\s*flex[^}]*width:\s*100%/isu);
    expect(mineStyles).toMatch(/\.menu-icon\s*\{[^}]*flex:\s*0\s+0\s+72rpx/isu);
    expect(mineStyles).toMatch(/\.menu-action\s*\{[^}]*margin-left:\s*auto[^}]*text-align:\s*right/isu);
  });

  it("keeps the approved result exits and account hierarchy instead of decorative identity blocks", () => {
    const result = read("pages/result/index.wxml");
    const resultController = read("pages/result/index.ts");
    const mine = read("pages/mine/index.wxml");

    expect(result).toContain("内容已通过事实来源检查");
    expect(result).toContain('bindtap="continueNextJob"');
    expect(result).toContain('bindtap="returnHome"');
    expect(result).not.toContain('bindtap="finish"');
    expect(resultController).toMatch(/\bcontinueNextJob\s*\(/u);
    expect(resultController).toMatch(/\breturnHome\s*\(/u);
    expect(resultController).not.toMatch(/\bfinish\s*\(/u);
    expect(mine).toContain("使用情况");
    expect(mine).toContain("今日生成额度");
    expect(mine).not.toContain('class="account-mark"');
  });

  it("starts every next-job flow with an empty draft, the current default resume and a clean stack", () => {
    const resultController = read("pages/result/index.ts");
    const generationController = read("pages/generation/index.ts");

    expect(resultController).toContain('runtime().setLastJobId("")');
    expect(resultController).toContain("wx.reLaunch");
    expect(resultController).toContain('/pages/generation/index?fresh=1');
    expect(resultController).not.toContain('navigateTo({ url: "/pages/generation');
    expect(generationController).toContain("images: [] as SelectedImage[]");
    expect(generationController).toContain('requestId: ""');
    expect(generationController).toContain('text: ""');
    expect(generationController).toContain("findIndex(({ isDefault }) => isDefault)");
  });

  it("includes resume review, failure, loading, weak-network and retry surfaces", () => {
    const allWxml = PAGE_ROUTES.map((route) => read(`${route}.wxml`)).join("\n");
    expect(allWxml).toContain("核对个人资料");
    expect(allWxml).toContain("加载中");
    expect(allWxml).toContain("网络连接不稳定");
    expect(allWxml).toContain("重新尝试");
    expect(allWxml).toContain("AI生成内容，请核对真实性");
  });

  it("does not ship visible em-dash copy", () => {
    const allVisibleCopy = PAGE_ROUTES.map((route) => read(`${route}.wxml`)).join("\n");
    expect(allVisibleCopy).not.toMatch(/[—–]/u);
  });
});
