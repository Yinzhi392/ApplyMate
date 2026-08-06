import { messageFrom, openPage, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

interface ResumeRecord {
  isDefault: boolean;
  jobId: string;
  profile: { name?: string };
  resumeId: string;
  status: "awaiting_confirmation" | "confirmed";
}

Page({
  data: {
    errorMessage: "",
    loading: true,
    resumes: [] as Array<ResumeRecord & { name: string; statusLabel: string }>,
  },

  onShow(): void {
    void this.loadResumes();
  },

  async loadResumes(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const response = await runtime().api.read<{ resumes: ResumeRecord[] }>("resume.list", {});
      this.setData({
        loading: false,
        resumes: response.resumes.map((resume) => ({
          ...resume,
          name: resume.profile.name ?? "未命名简历",
          statusLabel: resume.status === "confirmed" ? "已确认" : "等待确认",
        })),
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  addResume(): void {
    openPage("/pages/resume-upload/index");
  },

  continueConfirm(event: WechatMiniprogram.BaseEvent): void {
    const jobId = String(event.currentTarget.dataset.jobId ?? "");
    runtime().setLastJobId(jobId);
    openPage(`/pages/job/index?jobId=${jobId}`);
  },

  async setDefault(event: WechatMiniprogram.BaseEvent): Promise<void> {
    try {
      await runtime().api.write("resume.setDefault", {
        resumeId: String(event.currentTarget.dataset.resumeId ?? ""),
      });
      showSuccess("已设为默认");
      await this.loadResumes();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async deleteResume(event: WechatMiniprogram.BaseEvent): Promise<void> {
    const resumeId = String(event.currentTarget.dataset.resumeId ?? "");
    const modal = await wx.showModal({
      title: "删除这份简历？",
      content: "既有投递记录会保留生成时的脱敏事实快照。",
      confirmColor: "#9b3c31",
    });
    if (!modal.confirm) {
      return;
    }
    try {
      await runtime().api.write("resume.delete", { resumeId });
      showSuccess("简历已删除");
      await this.loadResumes();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },
});
