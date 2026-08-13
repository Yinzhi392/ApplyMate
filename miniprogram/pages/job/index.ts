import {
  createJobPoller,
  createJobProgressView,
  JobPollingError,
  type ClientJob,
} from "../../core/job-poller.js";
import { isWeakNetwork, messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

Page({
  data: {
    errorMessage: "",
    jobId: "",
    loading: true,
    progress: 12,
    stepItems: [
      { label: "读取任务输入", state: "is-current", dot: "1" },
      { label: "处理内容", state: "", dot: "2" },
      { label: "完成质量检查", state: "", dot: "3" },
    ],
    statusLabel: "排队",
    subtitle: "正在恢复任务信息。",
    title: "正在处理",
    weakNetwork: false,
  },

  onLoad(options: Record<string, string | undefined>): void {
    const jobId = options.jobId ?? runtime().getLastJobId();
    runtime().setLastJobId(jobId);
    this.setData({ jobId });
    void this.refresh();
  },

  async refresh(): Promise<void> {
    if (this.data.jobId === "") {
      this.setData({ errorMessage: "找不到任务，请返回后重新提交。", loading: false });
      return;
    }
    this.setData({ errorMessage: "", loading: true, weakNetwork: false });
    const poller = createJobPoller({
      delaysMs: [0, 500, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000],
      getJob: async (jobId) => runtime().api.read<ClientJob>("job.get", { jobId }),
      wait: async (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    });
    try {
      const job = await poller.poll(this.data.jobId, (update) => {
        const view = createJobProgressView(update.kind, update.status);
        this.setData({
          progress: view.progress,
          statusLabel: update.statusLabel,
          stepItems: view.steps.map((label, index) => ({
            label,
            state: index < view.activeStep ? "is-done" : index === view.activeStep ? "is-current" : "",
            dot: index < view.activeStep ? "✓" : String(index + 1),
          })),
          subtitle: view.subtitle,
          title: view.title,
        });
      });
      this.setData({ loading: false });
      this.openNext(job);
    } catch (error) {
      const paused = error instanceof JobPollingError && error.code === "POLLING_PAUSED";
      this.setData({
        errorMessage: messageFrom(error),
        loading: false,
        weakNetwork: isWeakNetwork(error),
      });
      if (paused) {
        this.setData({ statusLabel: "任务仍在处理中" });
      }
    }
  },

  openNext(job: ClientJob): void {
    if (job.status === "awaiting_user_confirmation") {
      if (job.kind !== "resume_parse") {
        this.setData({
          errorMessage: "岗位任务状态异常，请返回后重新提交。",
          loading: false,
        });
        return;
      }
      openPage(`/pages/resume-edit/index?jobId=${job.jobId}`);
      return;
    }
    if (job.status === "succeeded" && job.kind !== "resume_parse") {
      const applicationId = String(job.result?.applicationId ?? "");
      openPage(`/pages/result/index?applicationId=${applicationId}`);
    }
  },
});
