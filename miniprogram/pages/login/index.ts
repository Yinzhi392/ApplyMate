import { createLoginView, type AccessState } from "../../core/presenters.js";
import { isWeakNetwork, messageFrom, switchHome } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

Page({
  data: {
    accessState: "agreement_required" as AccessState,
    actionDisabled: true,
    actionLabel: "同意并继续",
    agreementChecked: false,
    description: "",
    errorMessage: "",
    helperText: "",
    inviteCode: "",
    isAdmin: false,
    isDemo: true,
    loading: true,
    showAgreement: true,
    showInviteInput: false,
    title: "正在确认登录状态",
    weakNetwork: false,
  },

  onLoad(): void {
    void this.loadStatus();
  },

  async loadStatus(): Promise<void> {
    this.setData({ errorMessage: "", loading: true, weakNetwork: false });
    try {
      const response = await runtime().api.read<{
        accessState: AccessState;
        isAdmin: boolean;
      }>("auth.status", {});
      const view = createLoginView({
        accessState: response.accessState,
        agreementChecked: this.data.agreementChecked,
        isAdmin: response.isAdmin,
        inviteCode: this.data.inviteCode,
        errorMessage: "",
      });
      this.setData({
        ...view,
        accessState: response.accessState,
        isAdmin: response.isAdmin,
        loading: false,
      });
    } catch (error) {
      this.setData({
        errorMessage: messageFrom(error),
        loading: false,
        weakNetwork: isWeakNetwork(error),
      });
    }
  },

  toggleAgreement(): void {
    const agreementChecked = !this.data.agreementChecked;
    this.setData({
      agreementChecked,
      actionDisabled: this.data.accessState === "agreement_required" && !agreementChecked,
    });
  },

  updateInviteCode(event: TextInputEvent): void {
    const inviteCode = event.detail.value;
    this.setData({ inviteCode, actionDisabled: inviteCode.trim() === "" });
  },

  showDocument(event: WechatMiniprogram.BaseEvent): void {
    const documentName = String(event.currentTarget.dataset.document ?? "协议");
    wx.showModal({
      title: documentName,
      content: "当前为邀请制内测版本。正式协议内容将在发布准备阶段由产品负责人确认。",
      showCancel: false,
    });
  },

  async submit(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      if (this.data.accessState === "agreement_required") {
        await runtime().api.write("agreement.accept", {
          privacyPolicyVersion: "mvp-1",
          userAgreementVersion: "mvp-1",
        });
        await this.loadStatus();
        return;
      }
      if (this.data.accessState === "invite_required") {
        await runtime().api.write("invite.activate", { code: this.data.inviteCode });
        await this.loadStatus();
        return;
      }
      if (this.data.accessState === "active") {
        switchHome();
        return;
      }
      this.setData({ errorMessage: "账号已停用，请联系管理员或等待数据删除完成。" });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },
});
