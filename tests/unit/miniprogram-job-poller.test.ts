import { describe, expect, it, vi } from "vitest";

import {
  createJobProgressView,
  createJobPoller,
  type ClientJob,
} from "../../miniprogram/core/job-poller.js";

describe("mini-program job recovery", () => {
  it("uses bounded backoff and stops at a terminal state", async () => {
    const jobs: ClientJob[] = [
      { jobId: "job_1", kind: "greeting_generate", status: "queued", statusLabel: "排队" },
      { jobId: "job_1", kind: "greeting_generate", status: "generating", statusLabel: "生成" },
      { jobId: "job_1", kind: "greeting_generate", status: "succeeded", statusLabel: "成功" },
    ];
    const terminal: ClientJob = {
      jobId: "job_1",
      kind: "greeting_generate",
      status: "succeeded",
      statusLabel: "成功",
    };
    const getJob = vi.fn(async (): Promise<ClientJob> => jobs.shift() ?? terminal);
    const wait = vi.fn(async () => undefined);
    const seen: string[] = [];
    const poller = createJobPoller({ getJob, wait, delaysMs: [0, 10, 20] });

    const result = await poller.poll("job_1", (job) => seen.push(job.status));

    expect(result.status).toBe("succeeded");
    expect(seen).toEqual(["queued", "generating", "succeeded"]);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("returns awaiting confirmation without consuming more polls", async () => {
    const job: ClientJob = {
      jobId: "job_2",
      kind: "resume_parse",
      status: "awaiting_user_confirmation",
      statusLabel: "等待用户确认",
    };
    const getJob = vi.fn(async () => job);
    const poller = createJobPoller({
      getJob,
      wait: async () => undefined,
      delaysMs: [0, 10],
    });

    await expect(poller.poll("job_2", () => undefined)).resolves.toEqual(job);
    expect(getJob).toHaveBeenCalledTimes(1);
  });

  it("presents resume parsing and greeting generation as different tasks", () => {
    expect(createJobProgressView("resume_parse", "parsing")).toMatchObject({
      title: "正在解析简历",
      progress: 52,
      steps: ["读取简历内容", "识别并整理个人事实", "准备一次性资料核对"],
    });
    expect(createJobProgressView("greeting_generate", "generating")).toMatchObject({
      title: "正在生成开场白",
      progress: 76,
      steps: ["读取岗位输入", "识别岗位职责与要求", "匹配简历事实并生成", "检查事实来源与格式"],
    });
  });

  it("ends finite polling with a recoverable timeout", async () => {
    const getJob = vi.fn(async (): Promise<ClientJob> => ({
      jobId: "job_3",
      kind: "resume_parse",
      status: "parsing",
      statusLabel: "解析",
    }));
    const poller = createJobPoller({
      getJob,
      wait: async () => undefined,
      delaysMs: [0, 0],
    });

    await expect(poller.poll("job_3", () => undefined)).rejects.toMatchObject({
      code: "POLLING_PAUSED",
      retryable: true,
    });
  });
});
