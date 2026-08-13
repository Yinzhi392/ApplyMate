import { describe, expect, it } from "vitest";

import { ApiClientError } from "../../miniprogram/services/api-client.js";
import { createDemoApiClient } from "../../miniprogram/services/demo-api.js";
import {
  PRIVACY_POLICY_VERSION,
  USER_AGREEMENT_VERSION,
} from "../../miniprogram/core/legal-documents.js";

describe("mini-program local UI gateway", () => {
  it("walks through agreement, invitation and administrator access states", async () => {
    const user = createDemoApiClient();
    await expect(user.read<{ accessState: string }>("auth.status", {})).resolves.toMatchObject({
      accessState: "agreement_required",
      isAdmin: false,
    });
    await user.write("agreement.accept", {
      userAgreementVersion: USER_AGREEMENT_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    });
    await expect(user.write("invite.activate", { code: "INVALID" })).rejects.toEqual(
      new ApiClientError("INVALID_REQUEST", "邀请码无效或已过期。", false),
    );
    await user.write("invite.activate", { code: "APPLYMATE" });
    await expect(user.read("auth.status", {})).resolves.toMatchObject({ accessState: "active" });

    const administrator = createDemoApiClient({ isAdmin: true });
    await administrator.write("agreement.accept", {
      userAgreementVersion: USER_AGREEMENT_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    });
    await expect(administrator.read("auth.status", {})).resolves.toMatchObject({
      accessState: "active",
      isAdmin: true,
      inviteRequired: false,
    });
  });

  it("rejects stale agreement versions and reports the current versions", async () => {
    const client = createDemoApiClient();

    await expect(client.read("auth.status", {})).resolves.toMatchObject({
      currentVersions: {
        userAgreementVersion: USER_AGREEMENT_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      },
    });
    await expect(client.write("agreement.accept", {
      userAgreementVersion: "mvp-1",
      privacyPolicyVersion: "mvp-1",
    })).rejects.toEqual(
      new ApiClientError("INVALID_REQUEST", "协议版本已更新，请重新阅读并同意。", false),
    );
  });

  it("supports resume parse, recovery, confirmation, default selection and preferences", async () => {
    const client = createDemoApiClient({ activated: true });
    const created = await client.write<{ jobId: string; resumeId: string }>("resume.parse", {
      inputType: "text",
      text: "林晓，产品实习经历，完成校园 AI 助手项目。",
    });
    const job = await client.read<{ status: string; result: { profile: { resumeId: string } } }>(
      "job.get",
      { jobId: created.jobId },
    );
    expect(job).toMatchObject({
      jobId: created.jobId,
      status: "awaiting_user_confirmation",
      result: { profile: { resumeId: created.resumeId, confirmed: false } },
    });

    await client.write("resume.confirm", {
      resumeId: created.resumeId,
      profile: job.result.profile,
    });
    await expect(client.read<{ resumes: unknown[] }>("resume.list", {})).resolves.toMatchObject({
      resumes: [expect.objectContaining({
        resumeId: created.resumeId,
        isDefault: true,
        status: "confirmed",
      })],
    });

    await client.write("user.updatePreferences", {
      preferenceText: "可立即到岗。希望远程",
    });
    await expect(client.read("user.get", {})).resolves.toMatchObject({
      user: {
        preferenceText: "可立即到岗。希望远程",
        preferenceFacts: [
          expect.objectContaining({ sourceType: "preference", text: "可立即到岗" }),
          expect.objectContaining({ sourceType: "preference", text: "希望远程" }),
        ],
      },
    });
  });

  it("generates directly from JD, then supports history, editing, rewrite, copy and feedback", async () => {
    const client = createDemoApiClient({ activated: true, withConfirmedResume: true });
    const created = await client.write<{ jobId: string }>("generation.create", {
      resumeId: "resume_demo0001",
      inputType: "text",
      text: "负责 AI 产品需求分析，支持远程实习。",
    });
    const succeeded = await client.read<{ status: string; result: { applicationId: string } }>(
      "job.get",
      { jobId: created.jobId },
    );
    expect(succeeded.status).toBe("succeeded");

    const second = await client.write<{ jobId: string }>("generation.create", {
      resumeId: "resume_demo0001",
      inputType: "text",
      text: "负责用户研究与需求文档，支持每周四天实习。",
    });
    await expect(client.read("job.get", { jobId: second.jobId })).resolves.toMatchObject({
      kind: "greeting_generate",
      status: "succeeded",
    });
    await expect(client.read("resume.list", {})).resolves.toMatchObject({
      resumes: [expect.objectContaining({ status: "confirmed" })],
    });

    const applicationId = succeeded.result.applicationId;
    const editedBody = "您好，我希望应聘贵司的 AI 产品实习生岗位。我的项目经历与岗位需求相关，请您核对具体内容。";
    const updated = await client.write<{ manualEvaluation: { canSave: boolean; warnings: unknown[] } }>(
      "application.update",
      { applicationId, greetingBody: editedBody, status: "applied", memo: "已发送" },
    );
    expect(updated.manualEvaluation.canSave).toBe(true);
    expect(updated.manualEvaluation.warnings.length).toBeGreaterThan(0);

    const rewrite = await client.write<{ jobId: string }>("generation.rewrite", {
      applicationId,
      mode: "rephrase",
    });
    await expect(client.read("job.get", { jobId: rewrite.jobId })).resolves.toMatchObject({
      status: "succeeded",
      result: { applicationId },
    });

    await client.write("feedback.submit", {
      applicationId,
      rating: "satisfied",
      note: "匹配依据清楚",
    });
    await client.write("feedback.submit", {
      applicationId,
      rating: "needs_improvement",
      note: "希望更简洁",
    });
    const detail = await client.read<{
      application: { status: string; memo: string };
      copyText: string;
      feedback: { rating: string; note: string };
      generationDisclosure: { availability: string; mode: string; message: string };
    }>("application.get", { applicationId });
    expect(detail.application).toMatchObject({ status: "applied", memo: "已发送" });
    expect(detail.copyText).toContain("\nAI生成内容，请核对真实性");
    expect(detail.feedback).toMatchObject({
      rating: "needs_improvement",
      note: "希望更简洁",
    });
    expect(detail.generationDisclosure).toMatchObject({
      availability: "available",
      mode: "demo",
      message: "本地演示数据，未调用真实 OCR 或模型",
    });
    const applications = await client.read<{ applications: Array<{ applicationId: string }> }>(
      "application.list",
      {},
    );
    expect(applications.applications).toHaveLength(2);
    expect(applications.applications).toEqual(
      expect.arrayContaining([expect.objectContaining({ applicationId })]),
    );
  });

  it("implements irreversible account deletion confirmation for the UI", async () => {
    const client = createDemoApiClient({ activated: true });
    const requested = await client.write<{ confirmationToken: string }>("user.delete", {
      operation: "request",
    });
    await client.write("user.delete", {
      operation: "confirm",
      confirmationToken: requested.confirmationToken,
    });
    await expect(client.read("auth.status", {})).resolves.toMatchObject({
      accessState: "disabled",
      accountStatus: "disabled",
    });
  });
});
