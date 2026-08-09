import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGE_ROUTES } from "../../miniprogram/core/routes.js";

const root = join(process.cwd(), "miniprogram");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("native mini-program UI integrity", () => {
  it("uses a dependency-free restrained glass system across all page roots", () => {
    const styles = read("app.wxss");
    const allTemplates = PAGE_ROUTES.map((route) => read(`${route}.wxml`));

    expect(styles).toContain("--color-glass-surface");
    expect(styles).toContain(".glass-surface");
    expect(styles).toContain("box-shadow: inset");
    expect(styles).not.toContain("backdrop-filter");
    expect(styles).not.toContain("filter: blur");
    allTemplates.forEach((template) => expect(template).toContain('class="page'));
  });
  it("ships a page configuration, template, controller and stylesheet for every route", () => {
    PAGE_ROUTES.forEach((route) => {
      expect(existsSync(join(root, `${route}.json`)), `${route}.json`).toBe(true);
      expect(existsSync(join(root, `${route}.wxml`)), `${route}.wxml`).toBe(true);
      expect(existsSync(join(root, `${route}.ts`)), `${route}.ts`).toBe(true);
      expect(existsSync(join(root, `${route}.wxss`)), `${route}.wxss`).toBe(true);
      expect(read(`${route}.wxss`).trim(), `${route}.wxss must not be empty`).not.toBe("");
    });
  });

  it("keeps the generation page bound to batch, delete, drag and mode handlers", () => {
    const template = read("pages/generation/index.wxml");
    const controller = read("pages/generation/index.ts");

    expect(template).toContain('bindtap="chooseImages"');
    expect(template).toContain('catchtap="removeImage"');
    expect(template).toContain('bindlongpress="startImageDrag"');
    expect(template).toContain('bindtouchmove="dragImage"');
    expect(template).toContain('bindtouchend="finishImageDrag"');
    expect(template).toContain('bindtap="changeInputMode"');
    expect(controller).toContain("MAX_JD_IMAGE_COUNT");
  });

  it("keeps result details and secondary actions behind working disclosures", () => {
    const template = read("pages/result/index.wxml");
    const controller = read("pages/result/index.ts");

    expect(template).toContain('bindtap="toggleDetails"');
    expect(template).toContain('bindtap="toggleSecondary"');
    expect(controller).toMatch(/\btoggleDetails\s*\(/u);
    expect(controller).toMatch(/\btoggleSecondary\s*\(/u);
  });

  it("does not reuse the retired card stack in page templates", () => {
    PAGE_ROUTES.forEach((route) => {
      expect(read(`${route}.wxml`), route).not.toContain('class="card');
    });
  });

  it("does not bind templates to missing page handlers", () => {
    PAGE_ROUTES.forEach((route) => {
      const template = read(`${route}.wxml`);
      const controller = read(`${route}.ts`);
      const handlers = Array.from(
        template.matchAll(/\b(?:bind|catch)[a-z:-]*="([A-Za-z][A-Za-z0-9]*)"/gu),
        (match) => match[1],
      );
      handlers.forEach((handler) => {
        expect(controller, `${route} is missing ${handler}`).toMatch(
          new RegExp(`\\b${handler}\\s*\\(`, "u"),
        );
      });
    });
  });

  it("keeps touch targets and safe-area spacing in the shared stylesheet", () => {
    const styles = read("app.wxss");
    expect(styles).toContain("min-height: 88rpx");
    expect(styles).toContain("env(safe-area-inset-bottom)");
    expect(styles).toContain("--color-background");
    expect(styles).toContain("--color-primary");
  });

  it("keeps page-specific interactive controls at the 88rpx touch target", () => {
    const controls = [
      ["pages/generation/index.wxss", ".mode-option"],
      ["pages/generation/index.wxss", ".icon-action"],
      ["pages/resume-upload/index.wxss", ".mode-option"],
      ["pages/resume-edit/index.wxss", ".mini-action"],
      ["pages/records/index.wxss", ".filter-option"],
      ["pages/result/index.wxss", ".rating-button"],
      ["pages/resumes/index.wxss", ".resume-more"],
    ] as const;

    controls.forEach(([file, selector]) => {
      const styles = read(file);
      const escapedSelector = selector.replace(".", "\\.");
      const rule = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
      expect(rule?.[1], `${file} ${selector}`).toContain("min-height: 88rpx");
    });
  });

  it("uses WeChat-stable flex layouts instead of high-risk native grid math", () => {
    const pageStyles = PAGE_ROUTES.map((route) => read(`${route}.wxss`)).join("\n");

    expect(pageStyles).not.toMatch(/display:\s*grid/iu);
    expect(pageStyles).not.toMatch(/grid-template/iu);
    expect(pageStyles).not.toMatch(/minmax\s*\(/iu);
    expect(pageStyles).not.toMatch(/repeat\s*\(/iu);
    expect(pageStyles).not.toMatch(/@media/iu);
  });

  it("contains every horizontal native action without relying on full-width children", () => {
    const styles = read("app.wxss");

    expect(styles).toMatch(/\.button\s*\{[^}]*min-width:\s*0/isu);
    expect(styles).toMatch(/\.button\s*\{[^}]*max-width:\s*100%/isu);
    expect(styles).toMatch(/\.action-row\s*\{[^}]*display:\s*flex/isu);
    expect(styles).toMatch(/\.action-row\s*>\s*\.button\s*\{[^}]*flex:\s*1/isu);
    expect(styles).toMatch(/\.action-row\s*>\s*\.button\s*\{[^}]*width:\s*auto/isu);
    expect(styles).toMatch(/\.page\s*\{[^}]*overflow-x:\s*hidden/isu);
  });

  it.each([320, 375, 390])(
    "keeps the weighted result actions readable inside a %ipx viewport",
    (viewportWidth) => {
      const appStyles = read("app.wxss");
      const resultStyles = read("pages/result/index.wxss");

      expect(appStyles).toContain("padding: 36rpx 32rpx");
      expect(appStyles).toContain("gap: 16rpx");
      expect(appStyles).toContain("flex-grow: 1.35");
      expect(appStyles).toContain("flex-grow: 0.85");
      expect(resultStyles).toContain("padding: 28rpx");

      const availableRpx = 750 - 64 - 56 - 16;
      const primaryContentPx =
        ((availableRpx * 1.35) / (1.35 + 0.85) - 32) * (viewportWidth / 750);
      const secondaryContentPx =
        ((availableRpx * 0.85) / (1.35 + 0.85) - 32) * (viewportWidth / 750);

      expect(primaryContentPx).toBeGreaterThanOrEqual(112);
      expect(secondaryContentPx).toBeGreaterThanOrEqual(56);
    },
  );

  it("opens in local demo mode without calling unapproved cloud resources", () => {
    const project = JSON.parse(readFileSync(join(process.cwd(), "project.config.json"), "utf8")) as {
      appid: string;
      miniprogramRoot: string;
      setting: { useCompilerPlugins: string[] };
    };
    const source = [
      read("app.ts"),
      ...PAGE_ROUTES.map((route) => read(`${route}.ts`)),
      ...["api-client.ts", "demo-api.ts", "runtime.ts"].map((file) => read(`services/${file}`)),
    ].join("\n");

    expect(project).toMatchObject({
      miniprogramRoot: "miniprogram/",
      setting: { useCompilerPlugins: ["typescript"] },
    });
    expect(project.appid).toMatch(/^(?:touristappid|wx[a-f0-9]{16})$/u);
    expect(source).not.toContain("wx.cloud");
  });

  it("keeps WeChat Developer Tools local configuration parseable without formatting it", () => {
    const projectPath = join(process.cwd(), "project.config.json");
    const project = JSON.parse(readFileSync(projectPath, "utf8")) as {
      appid: string;
      miniprogramRoot: string;
    };

    expect(project.appid).toMatch(/^(?:touristappid|wx[a-f0-9]{16})$/u);
    expect(project.miniprogramRoot).toBe("miniprogram/");

    const privatePath = join(process.cwd(), "project.private.config.json");
    if (existsSync(privatePath)) {
      expect(() => JSON.parse(readFileSync(privatePath, "utf8"))).not.toThrow();
    }
  });
});
