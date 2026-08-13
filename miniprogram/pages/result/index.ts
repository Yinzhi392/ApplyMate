import { countVisibleCharacters } from "../../core/input-rules.js";
import {
  describeGenerationDisclosure,
  type ClientGenerationDisclosure,
} from "../../core/generation-disclosure.js";
import { createResultView } from "../../core/result-presenter.js";
import { leaveResult, type ResultExitDestination } from "../../core/result-exit.js";
import { messageFrom, openPage, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

interface ApplicationDetail {
  application: Parameters<typeof createResultView>[0] & { memo?: string };
  copyText: string;
  generationDisclosure?: ClientGenerationDisclosure;
  feedback?: { note?: string; rating: "satisfied" | "needs_improvement" };
}

Page({
  data: {
    applicationId: "",
    claims: [] as ReturnType<typeof createResultView>["claims"],
    companyDisplayName: "贵司",
    copyText: "",
    detailsExpanded: false,
    errorMessage: "",
    feedbackNote: "",
    generationDisclosureDetails: "",
    generationDisclosureMessage: "生成信息不可用",
    greetingBody: "",
    jobTitle: "该岗位",
    leaving: false,
    loading: true,
    manualWarnings: [] as Array<{ code?: string; message?: string }>,
    memo: "",
    omittedRequirements: [] as string[],
    rating: "" as "" | "satisfied" | "needs_improvement",
    savedGreetingBody: "",
    secondaryExpanded: false,
    status: "not_applied" as "not_applied" | "applied",
    visibleCharacters: 0,
    warningMessages: [] as string[],
  },

  onLoad(options: Record<string, string | undefined>): void {
    this.setData({ applicationId: options.applicationId ?? "" });
    void this.loadResult();
  },

  async loadResult(): Promise<void> {
    if (this.data.applicationId === "") {
      this.setData({ errorMessage: "找不到生成结果。", loading: false });
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      const response = await runtime().api.read<ApplicationDetail>("application.get", {
        applicationId: this.data.applicationId,
      });
      const input = {
        ...response.application,
        copyText: response.copyText,
        memo: response.application.memo ?? "",
      };
      const view = createResultView(input);
      const disclosure = describeGenerationDisclosure(
        response.generationDisclosure,
      );
      this.setData({
        claims: view.claims,
        companyDisplayName: view.companyDisplayName,
        copyText: response.copyText,
        feedbackNote: response.feedback?.note ?? "",
        generationDisclosureDetails: disclosure.details,
        generationDisclosureMessage: disclosure.message,
        greetingBody: view.greetingBody,
        jobTitle: view.jobTitle,
        loading: false,
        manualWarnings: view.manualWarnings,
        memo: view.memo,
        omittedRequirements: view.omittedRequirements,
        rating: response.feedback?.rating ?? "",
        savedGreetingBody: view.greetingBody,
        status: view.status,
        visibleCharacters: countVisibleCharacters(view.greetingBody),
        warningMessages: view.warningMessages,
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  updateBody(event: TextInputEvent): void {
    const greetingBody = event.detail.value;
    this.setData({ greetingBody, visibleCharacters: countVisibleCharacters(greetingBody) });
  },

  updateMemo(event: TextInputEvent): void {
    this.setData({ memo: event.detail.value });
  },

  updateFeedbackNote(event: TextInputEvent): void {
    this.setData({ feedbackNote: event.detail.value });
  },

  toggleDetails(): void {
    this.setData({ detailsExpanded: !this.data.detailsExpanded });
  },

  toggleSecondary(): void {
    this.setData({ secondaryExpanded: !this.data.secondaryExpanded });
  },

  setRating(event: WechatMiniprogram.BaseEvent): void {
    const rating = String(event.currentTarget.dataset.rating);
    if (rating === "satisfied" || rating === "needs_improvement") {
      this.setData({ rating });
    }
  },

  async saveBody(): Promise<void> {
    const saved = await this.updateApplication({ greetingBody: this.data.greetingBody });
    if (saved) {
      this.setData({ savedGreetingBody: this.data.greetingBody });
      showSuccess("修改已保存");
    }
  },

  async saveMemo(): Promise<void> {
    const saved = await this.updateApplication({ memo: this.data.memo });
    if (saved) {
      showSuccess("备忘已保存");
    }
  },

  async markApplied(): Promise<void> {
    const saved = await this.updateApplication({ status: "applied" });
    if (saved) {
      this.setData({ status: "applied" });
      showSuccess("已标记投递");
    }
  },

  async updateApplication(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await runtime().api.write<{
        manualEvaluation: { warnings: Array<{ code?: string; message?: string }> };
      }>("application.update", { applicationId: this.data.applicationId, ...payload });
      this.setData({ manualWarnings: response.manualEvaluation.warnings });
      return true;
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
      return false;
    }
  },

  async copyBody(): Promise<void> {
    try {
      const saved = await this.updateApplication({ greetingBody: this.data.greetingBody });
      if (!saved) {
        return;
      }
      this.setData({ savedGreetingBody: this.data.greetingBody });
      const response = await runtime().api.read<{ copyText: string }>("application.get", {
        applicationId: this.data.applicationId,
      });
      await wx.setClipboardData({ data: response.copyText });
      this.setData({ copyText: response.copyText });
      await runtime().trackAnalytics({
        event: "greeting_copied",
        applicationId: this.data.applicationId,
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async rewrite(): Promise<void> {
    const modal = await wx.showModal({
      title: "确认 AI 改写？",
      content: "将基于你当前保存的文字重新改写，并消耗 1 次今日额度。",
      confirmText: "确认改写",
    });
    if (!modal.confirm) {
      return;
    }
    const saved = await this.updateApplication({ greetingBody: this.data.greetingBody });
    if (!saved) {
      return;
    }
    this.setData({ savedGreetingBody: this.data.greetingBody });
    try {
      const result = await runtime().api.write<{ jobId: string }>("generation.rewrite", {
        applicationId: this.data.applicationId,
        mode: "rephrase",
      });
      runtime().setLastJobId(result.jobId);
      openPage(`/pages/job/index?jobId=${result.jobId}`);
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async submitFeedback(): Promise<void> {
    if (this.data.rating === "") {
      return;
    }
    try {
      await runtime().api.write("feedback.submit", {
        applicationId: this.data.applicationId,
        note: this.data.feedbackNote,
        rating: this.data.rating,
      });
      showSuccess("反馈已更新");
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async continueNextJob(): Promise<void> {
    await this.leave("next_job");
  },

  async returnHome(): Promise<void> {
    await this.leave("home");
  },

  async leave(destination: ResultExitDestination): Promise<void> {
    if (this.data.leaving) {
      return;
    }
    this.setData({ errorMessage: "", leaving: true });
    let navigationStarted = false;
    try {
      await leaveResult(
        {
          currentBody: this.data.greetingBody,
          destination,
          savedBody: this.data.savedGreetingBody,
        },
        {
          goHome: async () => {
            await wx.switchTab({ url: "/pages/home/index" });
          },
          goToNextJob: async () => {
            runtime().setLastJobId("");
            await wx.reLaunch({ url: "/pages/generation/index?fresh=1" });
          },
          persist: async (body) => {
            const saved = await this.updateApplication({ greetingBody: body });
            if (!saved) {
              throw new Error("SAVE_FAILED");
            }
            this.setData({ savedGreetingBody: body });
          },
        },
      );
      navigationStarted = true;
    } catch (error) {
      if (!(error instanceof Error && error.message === "SAVE_FAILED")) {
        this.setData({ errorMessage: messageFrom(error) });
      }
    } finally {
      if (!navigationStarted) {
        this.setData({ leaving: false });
      }
    }
  },
});
