import { messageFrom, switchHome } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";
import { createResumeReview, type ResumeReviewFact } from "../../core/resume-review.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

interface FactItem {
  factId: string;
  sourceType: string;
  text: string;
  [key: string]: unknown;
}

interface EditableProfile {
  achievements: FactItem[];
  certificates: FactItem[];
  confirmed: boolean;
  education: FactItem[];
  experiences: FactItem[];
  languages: FactItem[];
  name?: string;
  otherFacts: FactItem[];
  preferences: FactItem[];
  projects: FactItem[];
  resumeId: string;
  skills: FactItem[];
}

Page({
  data: {
    confirmedFacts: [] as ResumeReviewFact[],
    editingKey: "",
    errorMessage: "",
    facts: [] as ResumeReviewFact[],
    jobId: "",
    loading: true,
    needsReview: [] as ResumeReviewFact[],
    profile: null as EditableProfile | null,
    profileName: "",
    reviewFactIds: [] as string[],
    strengths: [] as ReturnType<typeof createResumeReview>["strengths"],
    weights: [] as ReturnType<typeof createResumeReview>["weights"],
  },

  onLoad(options: Record<string, string | undefined>): void {
    const jobId = options.jobId ?? runtime().getLastJobId();
    this.setData({ jobId });
    void this.loadProfile();
  },

  async loadProfile(): Promise<void> {
    if (this.data.jobId === "") {
      this.setData({ errorMessage: "找不到解析任务，请重新上传简历。", loading: false });
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      const job = await runtime().api.read<{
        result?: { profile?: EditableProfile; reviewFactIds?: string[] };
      }>("job.get", { jobId: this.data.jobId });
      const profile = job.result?.profile;
      if (profile === undefined) {
        this.setData({ errorMessage: "解析结果尚未准备好。", loading: false });
        return;
      }
      this.applyReview(profile, job.result?.reviewFactIds ?? []);
      this.setData({ loading: false, profileName: profile.name ?? "" });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  updateName(event: TextInputEvent): void {
    const profile = this.data.profile;
    if (profile === null) {
      return;
    }
    profile.name = event.detail.value;
    this.setData({ profile, profileName: event.detail.value });
  },

  updateFact(event: TextInputEvent): void {
    const profile = this.data.profile;
    const section = String(event.currentTarget.dataset.section) as keyof EditableProfile;
    const index = Number(event.currentTarget.dataset.index);
    if (profile === null || !Array.isArray(profile[section])) {
      return;
    }
    const entries = profile[section] as FactItem[];
    const fact = entries[index];
    if (fact === undefined) {
      return;
    }
    fact.text = event.detail.value;
    this.applyReview(profile, this.data.reviewFactIds);
  },

  startFactEdit(event: WechatMiniprogram.BaseEvent): void {
    this.setData({ editingKey: String(event.currentTarget.dataset.key ?? "") });
  },

  finishFactEdit(): void {
    this.setData({ editingKey: "" });
  },

  markFactCorrect(event: WechatMiniprogram.BaseEvent): void {
    const factId = String(event.currentTarget.dataset.factId ?? "");
    const reviewFactIds = this.data.reviewFactIds.filter((candidate) => candidate !== factId);
    if (this.data.profile !== null) {
      this.applyReview(this.data.profile, reviewFactIds);
    }
  },

  deleteFact(event: WechatMiniprogram.BaseEvent): void {
    const profile = this.data.profile;
    const section = String(event.currentTarget.dataset.section) as keyof EditableProfile;
    const index = Number(event.currentTarget.dataset.index);
    if (profile === null || !Array.isArray(profile[section])) {
      return;
    }
    const entries = profile[section] as FactItem[];
    const removed = entries.splice(index, 1)[0];
    const reviewFactIds = removed === undefined
      ? this.data.reviewFactIds
      : this.data.reviewFactIds.filter((candidate) => candidate !== removed.factId);
    this.applyReview(profile, reviewFactIds);
  },

  applyReview(profile: EditableProfile, reviewFactIds: string[]): void {
    const review = createResumeReview(profile, reviewFactIds);
    this.setData({
      confirmedFacts: review.confirmedFacts,
      facts: [...review.needsReview, ...review.confirmedFacts],
      needsReview: review.needsReview,
      profile,
      reviewFactIds,
      strengths: review.strengths,
      weights: review.weights,
    });
  },

  async confirm(): Promise<void> {
    if (this.data.profile === null) {
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      await runtime().api.write("resume.confirm", {
        profile: this.data.profile,
        resumeId: this.data.profile.resumeId,
      });
      await wx.showToast({ title: "简历已确认", icon: "success" });
      switchHome();
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },
});
