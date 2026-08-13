import {
  getLegalDocument,
  isLegalDocumentId,
  renderLegalDocumentPlainText,
  type LegalDocumentId,
} from "../../core/legal-documents.js";
import { messageFrom, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

interface AgreementRecord {
  version: string;
  acceptedAt: string;
}

interface UserAgreementResponse {
  user: {
    agreements: {
      privacyPolicy?: AgreementRecord;
      userAgreement?: AgreementRecord;
    };
  };
}

type LegalPageOptions = Partial<Record<"document", string>>;

function formatAcceptedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "同意时间不可用";
  }
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
  const time = [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
  return `${parts.join("-")} ${time}`;
}

Page({
  data: {
    acceptedAtByDocument: {} as Partial<Record<LegalDocumentId, string>>,
    acceptedTimeLabel: "正在读取同意记录",
    currentDocument: getLegalDocument("user-agreement"),
    currentDocumentId: "user-agreement" as LegalDocumentId,
    errorMessage: "",
    loadingAgreement: true,
  },

  onLoad(options: LegalPageOptions): void {
    const requested = String(options.document ?? "user-agreement");
    const documentId = isLegalDocumentId(requested) ? requested : "user-agreement";
    this.applyDocument(documentId);
    void this.loadAgreementRecord();
  },

  applyDocument(documentId: LegalDocumentId): void {
    const acceptedAt = this.data.acceptedAtByDocument[documentId];
    this.setData({
      acceptedTimeLabel: documentId === "ai-service"
        ? "无需单独同意，随用户协议与隐私政策一并说明"
        : acceptedAt === undefined
          ? this.data.loadingAgreement ? "正在读取同意记录" : "尚未同意当前协议"
          : formatAcceptedAt(acceptedAt),
      currentDocument: getLegalDocument(documentId),
      currentDocumentId: documentId,
    });
  },

  selectDocument(event: WechatMiniprogram.BaseEvent): void {
    const requested = String(event.currentTarget.dataset.document ?? "");
    if (isLegalDocumentId(requested)) {
      this.applyDocument(requested);
    }
  },

  async loadAgreementRecord(): Promise<void> {
    this.setData({ errorMessage: "", loadingAgreement: true });
    try {
      const response = await runtime().api.read<UserAgreementResponse>("user.get", {});
      const acceptedAtByDocument: Partial<Record<LegalDocumentId, string>> = {};
      if (response.user.agreements.userAgreement !== undefined) {
        acceptedAtByDocument["user-agreement"] = response.user.agreements.userAgreement.acceptedAt;
      }
      if (response.user.agreements.privacyPolicy !== undefined) {
        acceptedAtByDocument["privacy-policy"] = response.user.agreements.privacyPolicy.acceptedAt;
      }
      this.setData({ acceptedAtByDocument, loadingAgreement: false });
      this.applyDocument(this.data.currentDocumentId);
    } catch (error) {
      this.setData({
        acceptedTimeLabel: this.data.currentDocumentId === "ai-service"
          ? "无需单独同意，随用户协议与隐私政策一并说明"
          : "同意时间暂不可用",
        errorMessage: `协议正文仍可查看。同意记录读取失败：${messageFrom(error)}`,
        loadingAgreement: false,
      });
    }
  },

  async copyDocument(): Promise<void> {
    try {
      await wx.setClipboardData({
        data: renderLegalDocumentPlainText(this.data.currentDocument),
      });
      showSuccess("全文已复制");
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },
});
