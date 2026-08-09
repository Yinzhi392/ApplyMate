import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { calculateLoginLayout } from "../../miniprogram/core/login-layout.js";

describe("native login layout", () => {
  it.each([
    { name: "iPhone notch", statusBarHeight: 47, menuTop: 51, menuBottom: 83, windowWidth: 390 },
    { name: "compact Android", statusBarHeight: 24, menuTop: 28, menuBottom: 60, windowWidth: 320 },
    { name: "missing capsule fallback", statusBarHeight: 20, menuTop: 0, menuBottom: 0, windowWidth: 375 },
  ])("keeps the heading below the WeChat menu on $name", (metrics) => {
    const layout = calculateLoginLayout(metrics);
    const requiredHeadingTop = metrics.menuBottom > metrics.menuTop
      ? metrics.menuBottom + 16
      : metrics.statusBarHeight + 52;

    expect(layout.headingTopPx).toBeGreaterThanOrEqual(requiredHeadingTop);
    expect(layout.contentTopPx).toBeGreaterThanOrEqual(metrics.statusBarHeight + 8);
  });

  it("feeds the measured capsule layout into the real login page", () => {
    const root = join(process.cwd(), "miniprogram/pages/login");
    const controller = readFileSync(join(root, "index.ts"), "utf8");
    const template = readFileSync(join(root, "index.wxml"), "utf8");
    const styles = readFileSync(join(root, "index.wxss"), "utf8");

    expect(controller).toContain("getMenuButtonBoundingClientRect");
    expect(controller).toContain("calculateLoginLayout");
    expect(template).toContain('style="padding-top: {{contentTopPx}}px;"');
    expect(template).toContain('class="login-content"');
    expect(template).toContain('class="login-action-row"');
    expect(template).not.toContain("本地验证邀请码");
    expect(styles).toMatch(/\.login-content\s*\{[^}]*justify-content:\s*center/isu);
    expect(styles).toMatch(/\.login-action-row\s*\{[^}]*width:\s*100%/isu);
  });
});
