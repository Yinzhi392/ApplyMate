import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("mobile Web application contract", () => {
  it("exposes every approved route and keeps the mini program as Legacy", () => {
    const app = source("web/src/app/App.tsx");
    const router = source("web/src/app/AppRouter.tsx");
    for (const route of [
      "/login", "/", "/resumes", "/resumes/new", "/resumes/:id/review",
      "/preferences", "/jobs/new", "/jobs/:jobId", "/results/:applicationId",
      "/records", "/records/:id", "/account", "/legal", "/admin",
    ]) {
      expect(router).toContain(`path="${route}"`);
    }
    expect(app).toContain("HashRouter");
    expect(app).not.toContain("BrowserRouter");
    expect(source("memory-bank/design-document.md")).toContain("Legacy");
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

  it("caches only the public shell and never API or user content", () => {
    const worker = source("web/public/sw.js");
    expect(worker).toContain("SHELL_ASSETS");
    expect(worker).toContain("/assets/");
    expect(worker).not.toMatch(/SHELL_ASSETS\s*=\s*\[[^\]]*["']\/["']/su);
    expect(worker).not.toContain('caches.match("/")');
    expect(worker).not.toMatch(/callFunction|temporary\/web|applicationId|greetingBody|localStorage/u);
  });

  it("starts OCR and generation only after the user submits", () => {
    const jobs = source("web/src/features/jobs/JobPages.tsx");
    expect(jobs).toContain("uploadPromise.current");
    expect(jobs).toContain('callApi<{ jobId: string }>("generation.create"');
    expect(jobs.indexOf("generation.create")).toBeGreaterThan(jobs.indexOf("async function submit"));
    expect(jobs).not.toContain("compressImage");
  });

  it("binds temporary uploads to the trusted internal user path", () => {
    const uploads = source("web/src/lib/cloudbase.ts");
    const api = source("cloudfunctions/api/deploy/experience-api.js");
    expect(uploads).toContain("temporary/web/${safeOwnerId(ownerId)}");
    expect(api).toContain("/temporary/web/${user.userId}/");
    expect(api).toMatch(/web-(?:anonymous|email)-uid-v1/u);
  });

  it("uses one-time email codes and does not expose invitations in the Web login", () => {
    const login = source("web/src/features/auth/LoginPage.tsx");
    const featureStyles = source("web/src/features/Feature.module.css");
    const cloudbase = source("web/src/lib/cloudbase.ts");
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
  });

  it("keeps administrator controls behind the trusted server role", () => {
    const account = source("web/src/features/account/AccountPages.tsx");
    expect(account).toContain("auth.status?.isAdmin === true");
    expect(account).toContain("当前邮箱身份不是管理员");
    expect(account).not.toMatch(/创建一次性邀请码|admin\.inviteCreate/u);
    expect(account).toContain("启用用户");
    expect(account).toContain("停用用户");
    expect(account).toContain("增加 5 次");
  });
});
