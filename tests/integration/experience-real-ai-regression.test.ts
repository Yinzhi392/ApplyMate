import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("experience build real AI regression", () => {
  it("uses CloudBase by default instead of the local demo client", () => {
    const runtime = read("miniprogram/services/runtime.ts");
    expect(runtime).toContain('mode: "cloudbase_experience" | "demo"');
    expect(runtime).toContain('? "demo"\n    : "cloudbase_experience"');
  });

  it("uploads resume and JD files instead of sending demo path markers", () => {
    const resume = read("miniprogram/pages/resume-upload/index.ts");
    const generation = read("miniprogram/pages/generation/index.ts");
    expect(resume).toContain("uploadTemporaryFiles");
    expect(generation).toContain("uploadTemporaryFiles");
    expect(resume).not.toContain("`demo:${");
  });

  it("handles resume cloud-upload failures inside the submit error boundary", () => {
    const resume = read("miniprogram/pages/resume-upload/index.ts");
    const submit = resume.slice(resume.indexOf("async submit():"));
    expect(submit.indexOf("try {")).toBeLessThan(submit.indexOf("uploadTemporaryFiles"));
    expect(submit.indexOf("loading: true")).toBeLessThan(submit.indexOf("uploadTemporaryFiles"));
  });

  it("enables the real worker behind an explicit zero-cost gate", () => {
    const api = read("cloudfunctions/api/deploy/index.js");
    const worker = read("cloudfunctions/worker/deploy/index.js");
    expect(api).toContain("APPLYMATE_REAL_AI_ENABLED");
    expect(worker).toContain("createExperienceWorker");
    expect(worker).toContain("APPLYMATE_REAL_AI_ENABLED");
    expect(worker).toContain("hasModelApiKey");
    expect(worker).toContain("hasOcrSessionToken");
  });

  it("dispatches real AI jobs through the SCF asynchronous event API", () => {
    const api = read("cloudfunctions/api/deploy/index.js");
    const invoker = read("cloudfunctions/api/deploy/scf-async-invoker.js");

    expect(api).toContain("createScfAsyncInvoker");
    expect(api).not.toMatch(/dispatchExperienceJob:[\s\S]*?app\.callFunction\(\{\s*name:\s*"worker"/u);
    expect(invoker).toContain('InvocationType: "Event"');
    expect(invoker).toContain('FunctionName: "worker"');
  });

  it("keeps resume parsing, greeting generation, and AI rewrite on the real worker", () => {
    const api = read("cloudfunctions/api/deploy/experience-api.js");
    const worker = read("cloudfunctions/worker/deploy/experience-worker.js");

    expect(api).toContain('"generation.create", "generation.rewrite"');
    expect(api).toContain('kind: "greeting_rewrite"');
    expect(worker).toContain('job.kind === "greeting_rewrite"');
    expect(worker).toContain("rewritePrompt(application, job.input.mode)");
  });
});
