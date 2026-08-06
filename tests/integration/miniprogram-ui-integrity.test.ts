import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGE_ROUTES } from "../../miniprogram/core/routes.js";

const root = join(process.cwd(), "miniprogram");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("native mini-program UI integrity", () => {
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

  it("opens in local tourist mode without calling unapproved cloud resources", () => {
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
      appid: "touristappid",
      miniprogramRoot: "miniprogram/",
      setting: { useCompilerPlugins: ["typescript"] },
    });
    expect(source).not.toContain("wx.cloud");
  });
});
