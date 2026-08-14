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

  it("requires dedicated OCR credentials instead of trusting CloudBase runtime credentials", () => {
    const worker = read("cloudfunctions/worker/deploy/index.js");

    expect(worker).toContain('hasEnvironmentValue("APPLYMATE_OCR_SECRET_ID")');
    expect(worker).toContain('hasEnvironmentValue("APPLYMATE_OCR_SECRET_KEY")');
    expect(worker).toContain("dedicatedOcrCredentialsAvailable()");
    expect(worker).toContain("process.env.APPLYMATE_OCR_SECRET_ID");
    expect(worker).toContain("process.env.APPLYMATE_OCR_SECRET_KEY");
    expect(worker).not.toContain("cloudbaseContext.TENCENTCLOUD_SECRETID");
    expect(worker).not.toContain("cloudbaseContext.TENCENTCLOUD_SECRETKEY");
    expect(worker).not.toContain("cloudbaseContext.TENCENTCLOUD_SESSIONTOKEN");
  });

  it("passes the configured CloudBase API key to every server-side database SDK", () => {
    const api = read("cloudfunctions/api/deploy/index.js");
    const worker = read("cloudfunctions/worker/deploy/index.js");
    const cleanup = read("cloudfunctions/cleanup/deploy/index.js");

    expect(api).toContain("accessKey: cloudbaseContext.CLOUDBASE_APIKEY");
    expect(worker).toContain("? { accessKey } : {}");
    expect(worker).toContain("hasCloudBaseApiKey");
    expect(cleanup).toContain("? { accessKey } : {}");
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

  it("persists experience records with user-scoped queries instead of silent doc-id updates", () => {
    const api = read("cloudfunctions/api/deploy/experience-api.js");
    const worker = read("cloudfunctions/worker/deploy/experience-worker.js");

    expect(worker).toContain('const resumeRecord = await findOne(database.collection("resumes"), {');
    expect(worker).toContain('database.collection("resumes").where({ _id: resumeRecord._id })');
    expect(worker).toContain("if (!resumeUpdated) throw new Error(\"DATABASE_WRITE_FAILED\")");
    expect(api).not.toMatch(/(?:resumes|applications)\.doc\(record\._id\)/u);
    expect(api).toContain('recordType: "resume", userId: user.userId, resumeId: payload.resumeId');
    expect(api).toContain('recordType: "application", userId: user.userId, applicationId: payload.applicationId');
  });

  it("stores structured resume profiles as JSON and decodes them at business boundaries", () => {
    const api = read("cloudfunctions/api/deploy/experience-api.js");
    const liveApi = read("cloudfunctions/api/deploy/live-api.js");
    const worker = read("cloudfunctions/worker/deploy/experience-worker.js");

    expect(worker).toContain("const profileJson = JSON.stringify(profile)");
    expect(worker).toContain("const resumeProfile = decodeStoredProfile(resume?.profile)");
    expect(api).toContain("profile: JSON.stringify(profile)");
    expect(api).toContain("profile: decodeStoredProfile(record.profile)");
    expect(liveApi).toContain("result: decodeJobResult(job.result)");
  });
});
