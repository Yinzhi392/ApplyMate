import { createJobPoller, JobPollingError, type ClientJob } from "../../core/job-poller.js";
import { isWeakNetwork, messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

Page({
  data: {
    errorMessage: "",
    jobId: "",
    loading: true,
    statusLabel: "排队",
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
      delaysMs: [0, 300, 600],
      getJob: async (jobId) => runtime().api.read<ClientJob>("job.get", { jobId }),
      wait: async (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    });
    try {
      const job = await poller.poll(this.data.jobId, (update) => {
        this.setData({ statusLabel: update.statusLabel });
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
      const page = job.kind === "resume_parse" ? "resume-edit" : "jd-confirm";
      openPage(`/pages/${page}/index?jobId=${job.jobId}`);
      return;
    }
    if (job.status === "succeeded" && job.kind !== "resume_parse") {
      const applicationId = String(job.result?.applicationId ?? "");
      openPage(`/pages/result/index?applicationId=${applicationId}`);
    }
  },
});
