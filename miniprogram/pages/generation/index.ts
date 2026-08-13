import {
  MAX_JD_IMAGE_COUNT,
  appendJdImages,
  buildActiveGenerationInput,
  removeJdImage,
  reorderJdImage,
  updateGenerationDraft,
  type GenerationDraft,
  type GenerationInputMode,
  type SelectedImage,
} from "../../core/input-rules.js";
import { createRequestId } from "../../services/api-client.js";
import { isWeakNetwork, messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";
import { uploadTemporaryFiles } from "../../services/cloud-storage.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type PickerEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type TouchEvent = WechatMiniprogram.BaseEvent & {
  touches: Array<{ clientY: number }>;
};

interface ResumeOption {
  isDefault: boolean;
  profile: { name?: string };
  resumeId: string;
  status: string;
}

Page({
  data: {
    errorMessage: "",
    dragStartY: 0,
    dragTargetIndex: -1,
    draggingIndex: -1,
    images: [] as SelectedImage[],
    inputMode: "images" as GenerationInputMode,
    loading: false,
    maxImageCount: MAX_JD_IMAGE_COUNT,
    requestId: "",
    resumeIndex: 0,
    resumeNames: [] as string[],
    resumes: [] as ResumeOption[],
    text: "",
    weakNetwork: false,
  },

  onLoad(): void {
    void this.loadResumes();
  },

  async loadResumes(): Promise<void> {
    try {
      const response = await runtime().api.read<{ resumes: ResumeOption[] }>("resume.list", {});
      const resumes = response.resumes.filter(({ status }) => status === "confirmed");
      const defaultIndex = resumes.findIndex(({ isDefault }) => isDefault);
      this.setData({
        resumeIndex: defaultIndex < 0 ? 0 : defaultIndex,
        resumeNames: resumes.map(({ profile }) => profile.name ?? "已确认简历"),
        resumes,
      });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  changeResume(event: PickerEvent): void {
    this.applyDraftChanges({ resumeIndex: Number(event.detail.value) });
  },

  updateText(event: TextInputEvent): void {
    this.applyDraftChanges({ text: event.detail.value });
  },

  changeInputMode(event: WechatMiniprogram.BaseEvent): void {
    const inputMode = String(event.currentTarget.dataset.mode);
    if (inputMode === "images" || inputMode === "text") {
      this.applyDraftChanges({ inputMode });
      this.setData({ errorMessage: "" });
    }
  },

  getDraft(): GenerationDraft {
    return {
      images: this.data.images,
      inputMode: this.data.inputMode,
      requestId: this.data.requestId,
      resumeIndex: this.data.resumeIndex,
      text: this.data.text,
    };
  },

  applyDraftChanges(changes: Partial<Omit<GenerationDraft, "requestId">>): void {
    this.setData(updateGenerationDraft(this.getDraft(), changes));
  },

  async chooseImages(): Promise<void> {
    const remaining = MAX_JD_IMAGE_COUNT - this.data.images.length;
    if (remaining <= 0) {
      this.setData({ errorMessage: "岗位截图最多选择 5 张。" });
      return;
    }
    try {
      const response = await wx.chooseMedia({
        count: remaining,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });
      const images = response.tempFiles.map(({ size, tempFilePath }) => ({ path: tempFilePath, size }));
      const result = appendJdImages(this.getDraft(), images);
      if (!result.valid) {
        this.setData({ errorMessage: result.message });
        return;
      }
      this.setData({ ...result.draft, errorMessage: "" });
    } catch (error) {
      if (error instanceof Error && /cancel/u.test(error.message)) {
        return;
      }
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  removeImage(event: WechatMiniprogram.BaseEvent): void {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ ...removeJdImage(this.getDraft(), index), errorMessage: "" });
  },

  startImageDrag(event: TouchEvent): void {
    const index = Number(event.currentTarget.dataset.index);
    const touch = event.touches[0];
    if (touch === undefined || index < 0 || index >= this.data.images.length) {
      return;
    }
    this.setData({
      dragStartY: touch.clientY,
      dragTargetIndex: index,
      draggingIndex: index,
    });
  },

  dragImage(event: TouchEvent): void {
    const touch = event.touches[0];
    if (touch === undefined || this.data.draggingIndex < 0) {
      return;
    }
    const rowHeight = wx.getWindowInfo().windowWidth / 750 * 144;
    const distance = touch.clientY - this.data.dragStartY;
    const target = Math.max(
      0,
      Math.min(
        this.data.images.length - 1,
        this.data.draggingIndex + Math.round(distance / rowHeight),
      ),
    );
    if (target !== this.data.dragTargetIndex) {
      this.setData({ dragTargetIndex: target });
    }
  },

  finishImageDrag(): void {
    if (this.data.draggingIndex < 0 || this.data.dragTargetIndex < 0) {
      return;
    }
    const draft = reorderJdImage(
      this.getDraft(),
      this.data.draggingIndex,
      this.data.dragTargetIndex,
    );
    this.setData({
      ...draft,
      dragStartY: 0,
      dragTargetIndex: -1,
      draggingIndex: -1,
    });
  },

  async submit(): Promise<void> {
    const resume = this.data.resumes[this.data.resumeIndex];
    if (resume === undefined) {
      this.setData({ errorMessage: "请先添加并确认一份简历。" });
      return;
    }
    const activeInput = buildActiveGenerationInput(this.getDraft());
    if (activeInput === undefined) {
      this.setData({
        errorMessage: this.data.inputMode === "images"
          ? "请至少添加 1 张岗位截图。"
          : "请先粘贴岗位文字。",
      });
      return;
    }
    const requestId = this.data.requestId || createRequestId();
    this.setData({ errorMessage: "", loading: true, requestId, weakNetwork: false });
    try {
      const submittedInput = activeInput.inputType === "images"
        ? {
            inputType: "images" as const,
            fileIds: await uploadTemporaryFiles(this.data.images.map(({ path }) => path)),
          }
        : activeInput;
      const result = await runtime().api.write<{ jobId: string }>("generation.create", {
        ...submittedInput,
        resumeId: resume.resumeId,
      }, requestId);
      runtime().setLastJobId(result.jobId);
      this.setData({ loading: false, requestId: "" });
      openPage(`/pages/job/index?jobId=${result.jobId}`);
    } catch (error) {
      this.setData({
        errorMessage: messageFrom(error),
        loading: false,
        weakNetwork: isWeakNetwork(error),
      });
    }
  },
});
