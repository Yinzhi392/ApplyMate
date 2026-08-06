import { messageFrom, openPage, replaceWithLogin } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

Page({
  data: {
    agreementVersion: "mvp-1",
    errorMessage: "",
    isAdmin: false,
    loading: true,
    resumeCount: 0,
  },

  onShow(): void {
    void this.loadMine();
  },

  async loadMine(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const [userResponse, resumeResponse] = await Promise.all([
        runtime().api.read<{
          user: {
            agreements: { userAgreement?: { version: string } };
            isAdmin: boolean;
          };
        }>("user.get", {}),
        runtime().api.read<{ resumes: unknown[] }>("resume.list", {}),
      ]);
      this.setData({
        agreementVersion: userResponse.user.agreements.userAgreement?.version ?? "未同意",
        isAdmin: userResponse.user.isAdmin,
        loading: false,
        resumeCount: resumeResponse.resumes.length,
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  openResumes(): void {
    openPage("/pages/resumes/index");
  },

  openPreferences(): void {
    openPage("/pages/preferences/index");
  },

  openAdmin(): void {
    if (this.data.isAdmin) {
      openPage("/pages/admin/index");
    }
  },

  showAgreements(): void {
    wx.showModal({
      title: "协议与隐私",
      content: `当前记录版本：${this.data.agreementVersion}。协议发生实质变化后必须重新同意。`,
      showCancel: false,
    });
  },

  async deleteAccount(): Promise<void> {
    const first = await wx.showModal({
      title: "删除账号？",
      content: "这会立即停用账号，并删除简历、记录、事实快照和反馈。该操作不可撤销。",
      confirmColor: "#9b3c31",
      confirmText: "继续删除",
    });
    if (!first.confirm) {
      return;
    }
    try {
      const request = await runtime().api.write<{ confirmationToken: string }>("user.delete", {
        operation: "request",
      });
      const second = await wx.showModal({
        title: "最后确认",
        content: "确认后无法恢复账号或任何事实快照。",
        confirmColor: "#9b3c31",
        confirmText: "确认删除",
      });
      if (!second.confirm) {
        return;
      }
      await runtime().api.write("user.delete", {
        confirmationToken: request.confirmationToken,
        operation: "confirm",
      });
      replaceWithLogin();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },
});
