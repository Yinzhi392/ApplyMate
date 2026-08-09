import { createLoginView, type AccessState } from "../../core/presenters.js";
import {
  isLoginActionDisabled,
  LoginFlowError,
  submitLoginFlow,
} from "../../core/login-flow.js";
import { calculateLoginLayout } from "../../core/login-layout.js";
import { isWeakNetwork, messageFrom, switchHome } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type CheckboxGroupEvent = WechatMiniprogram.CustomEvent<{ value: string[] }>;

Page({
  data: {
    accessState: "agreement_required" as AccessState,
    agreementRequired: true,
    actionDisabled: true,
    actionLabel: "同意并继续",
    agreementChecked: false,
    contentTopPx: 56,
    description: "",
    errorMessage: "",
    helperText: "",
    inviteCode: "",
    inviteRequired: true,
    isAdmin: false,
    loading: true,
    mode: "form" as "form" | "success" | "disabled" | "redirect",
    showAgreement: true,
    showInviteInput: false,
    title: "正在确认登录状态",
    weakNetwork: false,
  },

  onLoad(): void {
    const windowInfo = wx.getWindowInfo();
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const layout = calculateLoginLayout({
      menuBottom: menuButton.bottom,
      menuTop: menuButton.top,
      statusBarHeight: windowInfo.statusBarHeight ?? 20,
      windowWidth: windowInfo.windowWidth,
    });
    this.setData({ contentTopPx: layout.contentTopPx });
    void this.loadStatus();
  },

  async loadStatus(): Promise<void> {
    this.setData({ errorMessage: "", loading: true, weakNetwork: false });
    try {
      const response = await runtime().api.read<{
        accessState: AccessState;
        agreementRequired: boolean;
        inviteRequired: boolean;
        isAdmin: boolean;
      }>("auth.status", {});
      const view = createLoginView({
        accessState: response.accessState,
        agreementChecked: this.data.agreementChecked,
        inviteRequired: response.inviteRequired,
        isAdmin: response.isAdmin,
        inviteCode: this.data.inviteCode,
        errorMessage: "",
        justActivated: this.data.mode === "success",
      });
      this.setData({
        ...view,
        accessState: response.accessState,
        agreementRequired: response.agreementRequired,
        inviteRequired: response.inviteRequired,
        isAdmin: response.isAdmin,
        loading: false,
      });
      if (view.mode === "redirect") {
        switchHome();
      }
    } catch (error) {
      this.setData({
        errorMessage: messageFrom(error),
        loading: false,
        weakNetwork: isWeakNetwork(error),
      });
    }
  },

  changeAgreement(event: CheckboxGroupEvent): void {
    const agreementChecked = event.detail.value.includes("accepted");
    this.setData({
      agreementChecked,
      actionDisabled: isLoginActionDisabled({
        agreementChecked,
        agreementRequired: this.data.agreementRequired,
        inviteCode: this.data.inviteCode,
        inviteRequired: this.data.inviteRequired && !this.data.isAdmin,
      }),
    });
  },

  updateInviteCode(event: TextInputEvent): void {
    const inviteCode = event.detail.value;
    this.setData({
      inviteCode,
      actionDisabled: isLoginActionDisabled({
        agreementChecked: this.data.agreementChecked,
        agreementRequired: this.data.agreementRequired,
        inviteCode,
        inviteRequired: this.data.inviteRequired && !this.data.isAdmin,
      }),
    });
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
    if (this.data.loading) {
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      await submitLoginFlow({
        agreementChecked: this.data.agreementChecked,
        agreementRequired: this.data.agreementRequired,
        inviteCode: this.data.inviteCode,
        inviteRequired: this.data.inviteRequired && !this.data.isAdmin,
      }, {
        acceptAgreement: () => runtime().api.write("agreement.accept", {
          privacyPolicyVersion: "mvp-1",
          userAgreementVersion: "mvp-1",
        }),
        activateInvite: (code) => runtime().api.write("invite.activate", { code }),
      });
      this.setData({ mode: "success" });
      await this.loadStatus();
    } catch (error) {
      const agreementAccepted = error instanceof LoginFlowError && error.agreementAccepted;
      this.setData({
        ...(agreementAccepted
          ? {
              accessState: "invite_required" as AccessState,
              agreementChecked: true,
              agreementRequired: false,
              showAgreement: false,
            }
          : {}),
        errorMessage: messageFrom(error),
        loading: false,
      });
    }
  },

  enterHome(): void {
    switchHome();
  },

  async deleteAccount(): Promise<void> {
    const first = await wx.showModal({
      title: "删除账号？",
      content: "这会删除简历、记录和事实快照，操作不可撤销。",
      confirmColor: "#92483f",
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
        content: "确认后账号和全部可关联数据都无法恢复。",
        confirmColor: "#92483f",
        confirmText: "确认删除",
      });
      if (!second.confirm) {
        return;
      }
      await runtime().api.write("user.delete", {
        confirmationToken: request.confirmationToken,
        operation: "confirm",
      });
      await this.loadStatus();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },
});
