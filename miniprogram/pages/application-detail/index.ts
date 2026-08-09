import { messageFrom, openPage, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

interface DetailResponse {
  application: {
    greetingBody: string;
    jdSnapshot: {
      companyName?: { text: string };
      jobTitle?: { text: string };
    };
    memo?: string;
    status: "not_applied" | "applied";
    factSnapshot?: Array<{ text: string }>;
    updatedAt?: string;
  };
}

Page({
  data: {
    applicationId: "",
    companyName: "贵司",
    errorMessage: "",
    greetingBody: "",
    jobTitle: "该岗位",
    loading: true,
    memo: "",
    statusLabel: "未投递",
    sourceTexts: [] as string[],
    updatedAt: "",
  },

  onLoad(options: Record<string, string | undefined>): void {
    this.setData({ applicationId: options.applicationId ?? "" });
    void this.loadDetail();
  },

  async loadDetail(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const response = await runtime().api.read<DetailResponse>("application.get", {
        applicationId: this.data.applicationId,
      });
      this.setData({
        companyName: response.application.jdSnapshot.companyName?.text ?? "贵司",
        greetingBody: response.application.greetingBody,
        jobTitle: response.application.jdSnapshot.jobTitle?.text ?? "该岗位",
        loading: false,
        memo: response.application.memo ?? "",
        statusLabel: response.application.status === "applied" ? "已投递" : "未投递",
        sourceTexts: (response.application.factSnapshot ?? []).slice(0, 3).map(({ text }) => text),
        updatedAt: response.application.updatedAt ?? "",
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  openResult(): void {
    openPage(`/pages/result/index?applicationId=${this.data.applicationId}`);
  },

  async deleteRecord(): Promise<void> {
    const modal = await wx.showModal({
      title: "删除这条记录？",
      content: "删除后无法恢复。",
      confirmColor: "#9b3c31",
    });
    if (!modal.confirm) {
      return;
    }
    try {
      await runtime().api.write("application.delete", { applicationId: this.data.applicationId });
      showSuccess("记录已删除");
      await wx.switchTab({ url: "/pages/records/index" });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },
});
