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
      tabBar: { list: Array<{ pagePath: string; text: string }> };
    };

    expect(app.pages).toEqual(PAGE_ROUTES);
    expect(app.tabBar.list.map(({ pagePath, text }) => ({ pagePath, text }))).toEqual(TAB_ROUTES);
  });

  it.each([
    ["pages/login/index.wxml", ["投了吗", "用户协议", "隐私政策", "邀请码"]],
    ["pages/home/index.wxml", ["今日剩余", "上传岗位 JD", "粘贴岗位 JD", "最近记录"]],
    ["pages/resumes/index.wxml", ["我的简历", "设为默认", "删除"]],
    ["pages/generation/index.wxml", ["上传截图", "粘贴文字", "调整顺序"]],
    ["pages/result/index.wxml", ["个性化开场白", "匹配依据", "未采用要求", "复制正文"]],
    ["pages/records/index.wxml", ["未投递", "已投递", "暂无投递记录"]],
    ["pages/mine/index.wxml", ["求职偏好", "协议与隐私", "删除账号"]],
  ])("renders the approved core copy in %s", (file, labels) => {
    const content = read(file);
    labels.forEach((label) => expect(content).toContain(label));
  });

  it("includes confirmation, failure, loading, weak-network and retry surfaces", () => {
    const allWxml = PAGE_ROUTES.map((route) => read(`${route}.wxml`)).join("\n");
    expect(allWxml).toContain("等待确认");
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
