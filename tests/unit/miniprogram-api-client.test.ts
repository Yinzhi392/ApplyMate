import { describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  createApiClient,
} from "../../miniprogram/services/api-client.js";
import { isWeakNetwork } from "../../miniprogram/services/page-utils.js";

describe("mini-program API client", () => {
  it("adds a stable requestId to writes and unwraps successful data", async () => {
    const call = vi.fn().mockResolvedValue({
      result: { ok: true, data: { accepted: true } },
    });
    const client = createApiClient(call, () => "123e4567-e89b-42d3-a456-426614174000");

    await expect(client.write("agreement.accept", {
      userAgreementVersion: "1.0",
      privacyPolicyVersion: "1.0",
    })).resolves.toEqual({ accepted: true });
    expect(call).toHaveBeenCalledWith({
      name: "api",
      data: {
        action: "agreement.accept",
        payload: {
          userAgreementVersion: "1.0",
          privacyPolicyVersion: "1.0",
        },
        requestId: "123e4567-e89b-42d3-a456-426614174000",
      },
    });
  });

  it("keeps the same requestId when the caller retries a write", async () => {
    const call = vi.fn().mockResolvedValue({ result: { ok: true, data: {} } });
    const client = createApiClient(call, () => "generated-id");

    await client.write("generation.create", { resumeId: "resume_demo0001" }, "retry-id");

    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ requestId: "retry-id" }),
    }));
  });

  it("normalizes API failures without exposing raw provider errors", async () => {
    const call = vi.fn().mockResolvedValue({
      result: {
        ok: false,
        error: { code: "RESOURCE_PAUSED", message: "AI service paused.", retryable: true },
      },
    });
    const client = createApiClient(call, () => "generated-id");

    await expect(client.read("auth.status", {})).rejects.toEqual(
      new ApiClientError("RESOURCE_PAUSED", "AI service paused.", true),
    );
  });

  it("only labels transport failures as weak-network errors", () => {
    expect(isWeakNetwork(new ApiClientError("NETWORK_ERROR", "网络失败", true))).toBe(true);
    expect(isWeakNetwork(new ApiClientError("RESOURCE_PAUSED", "资源暂停", true))).toBe(false);
    expect(isWeakNetwork(new Error("普通页面错误"))).toBe(false);
  });
});
