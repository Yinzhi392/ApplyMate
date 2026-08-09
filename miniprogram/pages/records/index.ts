import { messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

interface ApplicationRecord {
  applicationId: string;
  jdSnapshot: {
    companyName?: { text: string };
    jobTitle?: { text: string };
  };
  memo?: string;
  status: "not_applied" | "applied";
}

Page({
  data: {
    errorMessage: "",
    filter: "all" as "all" | "not_applied" | "applied",
    loading: true,
    records: [] as Array<{
      applicationId: string;
      companyName: string;
      jobTitle: string;
      memo: string;
      statusLabel: string;
    }>,
  },

  onShow(): void {
    void this.loadRecords();
  },

  changeFilter(event: WechatMiniprogram.BaseEvent): void {
    const filter = String(event.currentTarget.dataset.filter);
    if (filter === "all" || filter === "not_applied" || filter === "applied") {
      this.setData({ filter });
      void this.loadRecords();
    }
  },

  async loadRecords(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const response = await runtime().api.read<{ applications: ApplicationRecord[] }>(
        "application.list",
        this.data.filter === "all" ? {} : { status: this.data.filter },
      );
      this.setData({
        loading: false,
        records: response.applications.map((application) => ({
          applicationId: application.applicationId,
          companyName: application.jdSnapshot.companyName?.text ?? "贵司",
          jobTitle: application.jdSnapshot.jobTitle?.text ?? "该岗位",
          memo: application.memo ?? "",
          statusLabel: application.status === "applied" ? "已投递" : "未投递",
        })),
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  openRecord(event: WechatMiniprogram.BaseEvent): void {
    const applicationId = String(event.currentTarget.dataset.applicationId ?? "");
    openPage(`/pages/application-detail/index?applicationId=${applicationId}`);
  },
});
