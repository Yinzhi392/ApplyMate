import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("mobile Web application contract", () => {
  it("exposes every approved route and keeps the mini program as Legacy", () => {
    const app = source("web/src/app/App.tsx");
    const router = source("web/src/app/AppRouter.tsx");
    for (const route of [
      "/", "/login", "/legal", "/support", "/app", "/app/resumes",
      "/app/resumes/new", "/app/resumes/:id/review", "/app/preferences",
      "/app/jobs/new", "/app/jobs/:jobId", "/app/results/:applicationId",
      "/app/records", "/app/records/:id", "/app/account", "/app/admin",
    ]) {
      expect(router).toContain(`path="${route}"`);
    }
    expect(app).toContain("BrowserRouter");
    expect(app).not.toContain("HashRouter");
    expect(router).toContain("lazy(");
    expect(source("memory-bank/design-document.md")).toContain("legacy-miniprogram-final");
  });

  it("keeps the legal link independent from the agreement checkbox", () => {
    const login = source("web/src/features/auth/LoginPage.tsx");
    expect(login).toContain('id="agreement-accepted"');
    expect(login).toContain('htmlFor="agreement-accepted"');
    expect(login).not.toMatch(/<label className=\{styles\.checkRow\}>[\s\S]*?<Link/u);
  });

  it("uses mobile-safe sizing and prevents horizontal overflow", () => {
    const global = source("web/src/styles/global.css");
    const frame = source("web/src/ui/PageFrame.module.css");
    expect(global).toContain("min-width: 320px");
    expect(global).toContain("min-height: 100dvh");
    expect(global).toContain("overflow-x: hidden");
    expect(frame).toContain("env(safe-area-inset-top)");
    expect(frame).toContain("env(safe-area-inset-bottom)");
    expect(frame).toContain("min-height: 44px");
  });

  it("removes the PWA shell and unregisters old workers without registering a new one", () => {
    const main = source("web/src/main.tsx");
    const html = source("web/index.html");
    expect(existsSync("web/public/sw.js")).toBe(false);
    expect(existsSync("web/public/manifest.webmanifest")).toBe(false);
    expect(main).toContain("registration.unregister()");
    expect(main).not.toContain("serviceWorker.register");
    expect(html).not.toContain("manifest.webmanifest");
  });

  it("starts OCR and generation only after the user submits", () => {
    const jobs = source("web/src/features/jobs/JobPages.tsx");
    expect(jobs).toContain("uploadPromise.current");
    expect(jobs).toContain("prepareAndUploadJdImages");
    expect(jobs).toContain('callApi<{ jobId: string }>("generation.create"');
    expect(jobs.indexOf("generation.create")).toBeGreaterThan(jobs.indexOf("async function submit"));
    expect(source("web/src/lib/jd-image-preparation.ts")).toContain("new Worker");
  });

  it("binds temporary uploads to the trusted internal user path", () => {
    const uploads = source("web/src/lib/temporary-upload-adapter.ts");
    const api = source("cloudfunctions/api/deploy/experience-api.js");
    expect(uploads).toContain("temporary/web/${safeOwnerId(ownerId)}");
    expect(api).toContain("/temporary/web/${user.userId}/");
    expect(api).toMatch(/web-(?:anonymous|email)-uid-v1/u);
  });

  it("uses one-time email codes and does not expose invitations in the Web login", () => {
    const login = source("web/src/features/auth/LoginPage.tsx");
    const featureStyles = source("web/src/features/Feature.module.css");
    const cloudbase = source("web/src/lib/session.ts");
    expect(login).toContain("requestEmailVerification");
    expect(login).toContain("signInWithEmailCode");
    expect(login).not.toMatch(/邀请码|invite\.activate/u);
    expect(cloudbase).toContain("signInWithOtp({ email })");
    expect(cloudbase).toContain("verifyOtp({ token: code })");
    expect(cloudbase).not.toContain("getVerification({ email");
    expect(cloudbase).not.toContain("signInWithEmail({");
    expect(cloudbase).not.toContain("signInAnonymously");
    expect(login).toContain("styles.verificationRow");
    expect(login).toContain("styles.verificationButton");
    expect(featureStyles).toMatch(/\.verificationRow\s*\{[^}]*align-items:\s*flex-end;/su);
    expect(featureStyles).toMatch(/\.verificationRow\s*>\s*\.verificationButton\s*\{[^}]*min-height:\s*48px;[^}]*flex:\s*0\s+0\s+auto;/su);
  });

  it("does not expose matching evidence or internal validation on the result page", () => {
    const result = source("web/src/features/results/ResultPage.tsx");
    expect(result).not.toMatch(/omittedRequirements|匹配依据|内部校验/u);
    expect(result).toContain("继续投下一个岗位");
    expect(result).toContain("AI生成内容，请核对真实性");
    expect(result).not.toContain("generation.rewrite");
    expect(result).not.toContain("AI 改写");
  });

  it("uses accessible application dialogs instead of native browser prompts", () => {
    const webSources = [
      source("web/src/features/resumes/ResumePages.tsx"),
      source("web/src/features/records/RecordPages.tsx"),
      source("web/src/features/account/AccountPages.tsx"),
    ].join("\n");
    expect(webSources).not.toMatch(/window\.(?:prompt|confirm)/u);
    expect(webSources).toContain("ConfirmDialog");
    expect(webSources).toContain("ActionSheet");
    expect(source("web/src/ui/Dialog.tsx")).toContain("showModal()");
  });

  it("splits session, uploads and business API behind separate modules", () => {
    expect(source("web/src/lib/session.ts")).toContain("requestEmailVerification");
    expect(source("web/src/lib/temporary-upload.ts")).toContain("TemporaryUploadPort");
    expect(source("web/src/lib/api.ts")).toContain("callApi");
    expect(source("web/src/lib/cloudbase.ts")).not.toContain("signInWithOtp");
  });

  it("keeps the public administrator page role-gated and read-only", () => {
    const account = source("web/src/features/account/AccountPages.tsx");
    expect(account).toContain("auth.status?.isAdmin === true");
    expect(account).toContain("当前邮箱身份不是管理员");
    expect(account).not.toMatch(/创建一次性邀请码|admin\.inviteCreate/u);
    expect(account).not.toMatch(/admin\.userSetEnabled|admin\.quotaAdjust/u);
    expect(account).toContain("没有修改 100 元预算上限或用户额度的入口");
  });

  it("has real-browser mobile checks for the approved viewport and routing gates", () => {
    const browserTest = source("tests/browser/mobile-web.spec.ts");
    expect(browserTest).toContain("width: 320");
    expect(browserTest).toContain("width: 390");
    expect(browserTest).toContain("width: 430");
    expect(browserTest).toContain("getRegistrations");
    expect(browserTest).toContain('page.goto("/app/records")');
  });
});
