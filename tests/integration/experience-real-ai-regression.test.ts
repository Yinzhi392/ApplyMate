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

  it("uploads JD originals in the background instead of sending demo path markers", () => {
    const resume = read("miniprogram/pages/resume-upload/index.ts");
    const generation = read("miniprogram/pages/generation/index.ts");
    expect(resume).toContain("uploadTemporaryFiles");
    expect(generation).toContain("uploadTemporaryFile");
    expect(resume).not.toContain("`demo:${");
    const choose = generation.slice(
      generation.indexOf("async chooseImages():"),
      generation.indexOf("async submit():"),
    );
    expect(choose).not.toContain("prepareOcrImagePaths");
    expect(choose).toContain("startPendingUploads");
    expect(generation).toContain("runWithConcurrency(pendingIds, 3");
    expect(generation.slice(generation.indexOf("async submit():"))).not.toContain(
      "uploadTemporaryFile",
    );
    expect(generation).toContain("fileIds: this.data.images.map");
  });

  it("keeps the deployed preference payload aligned with the shared API contract", () => {
    const api = read("cloudfunctions/api/deploy/experience-api.js");
    const worker = read("cloudfunctions/worker/deploy/experience-worker.js");
    const preferenceHandler = api.slice(
      api.indexOf('event.action === "user.updatePreferences"'),
      api.indexOf('event.action === "resume.parse"'),
    );

    expect(preferenceHandler).toContain('typeof payload.preferenceText !== "string"');
    expect(preferenceHandler).toContain("preferenceText: normalizedPreferenceText");
    expect(preferenceHandler).toContain("preferenceFacts");
    expect(preferenceHandler).not.toContain("typeof payload.text");
    expect(worker).toContain("savedPreferenceFacts");
    expect(worker).toContain('[...allFacts(resumeProfile), ...savedPreferenceFacts]');
  });

  it("returns jobId without inline polling and serves a safe result preview through job.get", () => {
    const api = read("cloudfunctions/api/deploy/experience-api.js");
    const liveApi = read("cloudfunctions/api/deploy/live-api.js");
    const generation = read("miniprogram/pages/generation/index.ts");

    expect(api).not.toContain("waitForGenerationResult");
    expect(api).toContain("return { ok: true, data: { jobId } }");
    expect(liveApi).not.toContain("generationInlinePollAttempts");
    expect(liveApi).toContain("resultPreview");
    expect(api).toContain('event.action === "performance.recordPreview"');
    expect(generation).toContain("/pages/job/index?jobId=");
  });

  it("records client image preparation timing without storing source content", () => {
    const api = read("cloudfunctions/api/deploy/experience-api.js");
    const generation = read("miniprogram/pages/generation/index.ts");
    const worker = read("cloudfunctions/worker/deploy/experience-worker.js");

    expect(generation).toContain('clientPipelineVersion: "jd-submit-v6-background-upload"');
    expect(generation).toContain("clientSelectionToCreateMs");
    expect(generation).toContain("clientBackgroundUploadMs");
    expect(generation).toContain("clientImagePreparationMs");
    expect(api).toContain("clientPipelineMetrics(payload)");
    expect(worker).toContain("clientImagePreparationMs");
    expect(worker).toContain("modelDurationMs");
    expect(worker).toContain("totalDurationMs");
    expect(worker).toContain("ocrTransportMode");
    expect(worker).toContain("fallbackDurationMs");
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

  it("keeps the experience greeting path parallel, single-call, and case-calibrated", () => {
    const worker = read("cloudfunctions/worker/deploy/experience-worker.js");
    const storage = read("miniprogram/services/cloud-storage.ts");
    const generation = read("miniprogram/pages/generation/index.ts");

    expect(storage).toContain("runWithConcurrency(paths, 3");
    const activeUpload = storage.slice(storage.indexOf("prepareAndUploadOcrImagesWithMetrics"));
    expect(activeUpload).not.toContain("wx.compressImage");
    expect(generation).toContain('sizeType: ["original"]');
    expect(generation).not.toContain('sizeType: ["compressed"]');
    const choose = generation.slice(
      generation.indexOf("async chooseImages():"),
      generation.indexOf("async submit():"),
    );
    expect(choose).not.toContain("prepareOcrImagePaths");
    expect(choose).toContain("startPendingUploads");
    expect(generation.slice(generation.indexOf("async submit():"))).not.toContain(
      "uploadTemporaryFile",
    );
    expect(worker).toContain("const results = await Promise.all(");
    expect(worker).toContain("ImageUrl");
    expect(worker).toContain("getTempFileURL");
    expect(worker).toContain("getTempFileURL({ fileList: fileIds })");
    expect(worker).toContain('require("sharp")');
    expect(worker).toContain('"matchMode"');
    expect(worker).toContain('"directFactIds"');
    expect(worker).toContain('"transferableEvidence"');
    expect(worker).toContain('"paragraphs"');
    expect(worker).not.toContain('"selectedFactIds"');
    const generationPrompt = worker.slice(
      worker.indexOf("function jdPrompt"),
      worker.indexOf("const REWRITE_WORDING_STRENGTH"),
    );
    expect(generationPrompt).not.toContain('"claims"');
    const generationResolver = worker.slice(
      worker.indexOf("async function resolveGreetingGeneration"),
      worker.indexOf("function rewriteApplicationSnapshot"),
    );
    expect(generationResolver).toContain("modelGreetingPackageWithLocalValidation");
    expect(generationResolver).not.toContain("normalizeGreetingPlan");
    expect(generationResolver).not.toContain("buildFactMatches");
    expect(generationResolver).not.toContain("buildVerifiedGenericGreeting");
    expect(worker).toContain("classifyRoleFamily");
    expect(worker).toContain("experience-evidence-adaptive-v9.2");
    expect(worker).toContain("maxTokens: 2_200");
    expect(worker).toContain("timeoutMs: 14_000");
    expect(worker).not.toContain('"omittedRequirements":[]');
    expect(worker).not.toContain('"warnings":[]');
    expect(worker).toContain("inputDurationMs");
    expect(worker).toContain("renderMode");
    expect(worker).toContain("totalDurationMs");
    expect(worker).not.toContain("resumeCorrectionPrompt");
    expect(worker).not.toContain("parseResumeWithCorrection");
    expect(generationResolver).not.toContain("verified_generic_fallback");
    expect(worker).toContain('serverPipelineVersion: "greeting-v9.2-numeric-equivalence"');
    expect(worker).toContain("queueDurationMs");
    expect(worker).toContain("resolveGreetingGeneration");
    expect(worker).not.toContain("function renderGreetingPackage");
    expect(worker).not.toContain("facts.slice(0, 3)");
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
    expect(liveApi).toContain("decodeJobResult(job.result)");
  });

  it("documents the experience build as real AI and labels the old bootstrap state as history", () => {
    const guide = read("docs/phase-10/experience-version-upload-guide.md");
    const bootstrap = read("docs/phase-10/cloudbase-admin-bootstrap.md");

    expect(guide).toContain("体验成员使用真实 CloudBase、腾讯 OCR 和 TokenHub AI");
    expect(guide).toContain("state=experience_real_ai_live");
    expect(guide).toContain("acceptsUserTraffic=true");
    expect(bootstrap).toContain("> **历史记录：**");
    expect(bootstrap).toContain("不再代表当前体验版运行状态");
  });
});
