import { messageFrom, openPage, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";
import { createResumeActions, type ResumeActionType } from "../../core/resume-actions.js";

interface ResumeRecord {
  isDefault: boolean;
  jobId: string;
  profile: { name?: string };
  resumeId: string;
  status: "awaiting_confirmation" | "confirmed";
}

function isActionSheetCancel(error: unknown): boolean {
  if (error instanceof Error) {
    return /cancel/u.test(error.message);
  }
  if (typeof error === "object" && error !== null && "errMsg" in error) {
    return /cancel/u.test(String(error.errMsg));
  }
  return false;
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

  continueConfirmation(jobId: string): void {
    runtime().setLastJobId(jobId);
    openPage(`/pages/job/index?jobId=${jobId}`);
  },

  async setDefaultResume(resumeId: string): Promise<void> {
    try {
      await runtime().api.write("resume.setDefault", {
        resumeId,
      });
      showSuccess("已设为默认");
      await this.loadResumes();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async deleteResumeById(resumeId: string): Promise<void> {
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

  async openResumeActions(event: WechatMiniprogram.BaseEvent): Promise<void> {
    const index = Number(event.currentTarget.dataset.index);
    const resume = this.data.resumes[index];
    if (resume === undefined) {
      return;
    }
    const actions = createResumeActions(resume);
    try {
      const selection = await wx.showActionSheet({
        alertText: resume.name,
        itemList: actions.map(({ label }) => label),
      });
      const action = actions[selection.tapIndex];
      if (action === undefined) {
        return;
      }
      await this.runResumeAction(action.type, resume);
    } catch (error) {
      if (isActionSheetCancel(error)) {
        return;
      }
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async runResumeAction(
    type: ResumeActionType,
    resume: ResumeRecord,
  ): Promise<void> {
    if (type === "continue_confirmation") {
      this.continueConfirmation(resume.jobId);
      return;
    }
    if (type === "set_default") {
      await this.setDefaultResume(resume.resumeId);
      return;
    }
    await this.deleteResumeById(resume.resumeId);
  },
});
