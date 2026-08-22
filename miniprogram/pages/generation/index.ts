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
import {
  runWithConcurrency,
  uploadTemporaryFile,
} from "../../services/cloud-storage.js";
import { isWeakNetwork, messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

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

interface PreparedJdImage extends SelectedImage {
  completedAtMs: number;
  fileId: string;
  localId: string;
  selectedAtMs: number;
  uploadDurationMs: number;
  uploadErrorCode: "" | "NETWORK_ERROR" | "UPLOAD_FAILED";
  uploadState: "local" | "uploading" | "uploaded" | "failed";
}

const JD_UPLOAD_DRAFT_KEY = "applymate:jd-upload-draft-v2";

function restorePreparedImages(value: unknown): PreparedJdImage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_JD_IMAGE_COUNT).flatMap((candidate) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      typeof Reflect.get(candidate, "localId") !== "string" ||
      typeof Reflect.get(candidate, "path") !== "string" ||
      !Number.isFinite(Reflect.get(candidate, "size"))
    ) return [];
    const fileId = typeof Reflect.get(candidate, "fileId") === "string"
      ? String(Reflect.get(candidate, "fileId"))
      : "";
    const storedState = Reflect.get(candidate, "uploadState");
    const uploadState = fileId !== ""
      ? "uploaded"
      : storedState === "failed"
        ? "local"
        : "local";
    return [{
      completedAtMs: Number(Reflect.get(candidate, "completedAtMs")) || 0,
      fileId,
      localId: String(Reflect.get(candidate, "localId")),
      path: String(Reflect.get(candidate, "path")),
      selectedAtMs: Number(Reflect.get(candidate, "selectedAtMs")) || Date.now(),
      size: Number(Reflect.get(candidate, "size")),
      uploadDurationMs: Number(Reflect.get(candidate, "uploadDurationMs")) || 0,
      uploadErrorCode: "",
      uploadState,
    } satisfies PreparedJdImage];
  });
}

function imageUploadView(images: readonly PreparedJdImage[]): {
  failedUploadCount: number;
  imagesReady: boolean;
  uploadedCount: number;
  uploadingCount: number;
  uploadStatusText: string;
} {
  const uploadedCount = images.filter(({ uploadState }) => uploadState === "uploaded").length;
  const uploadingCount = images.filter(({ uploadState }) => uploadState === "uploading" || uploadState === "local").length;
  const failedUploadCount = images.filter(({ uploadState }) => uploadState === "failed").length;
  const imagesReady = images.length > 0 && uploadedCount === images.length;
  return {
    failedUploadCount,
    imagesReady,
    uploadedCount,
    uploadingCount,
    uploadStatusText: failedUploadCount > 0
      ? `${failedUploadCount} 张上传失败`
      : imagesReady
        ? "识别并生成"
        : `上传中 ${uploadedCount}/${images.length}`,
  };
}

let networkRecoveryHandler: WechatMiniprogram.OnNetworkStatusChangeCallback | undefined;

Page({
  data: {
    errorMessage: "",
    dragStartY: 0,
    dragTargetIndex: -1,
    draggingIndex: -1,
    failedUploadCount: 0,
    images: [] as PreparedJdImage[],
    imagesReady: false,
    inputMode: "images" as GenerationInputMode,
    loading: false,
    maxImageCount: MAX_JD_IMAGE_COUNT,
    preparingImages: false,
    requestId: "",
    resumeIndex: 0,
    resumeNames: [] as string[],
    resumes: [] as ResumeOption[],
    text: "",
    uploadedCount: 0,
    uploadingCount: 0,
    uploadPumpActive: false,
    uploadStatusText: "识别并生成",
    weakNetwork: false,
  },

  onLoad(options: Record<string, string | undefined>): void {
    if (options.fresh === "1") {
      wx.removeStorageSync(JD_UPLOAD_DRAFT_KEY);
    } else {
      const restoredImages = restorePreparedImages(
        wx.getStorageSync<unknown>(JD_UPLOAD_DRAFT_KEY),
      );
      if (restoredImages.length > 0) this.setImages(restoredImages);
    }
    networkRecoveryHandler = ({ isConnected }) => {
      if (isConnected) void this.resumeFailedUploads();
    };
    wx.onNetworkStatusChange(networkRecoveryHandler);
    void this.loadResumes();
  },

  onShow(): void {
    void this.startPendingUploads(false);
  },

  onUnload(): void {
    if (networkRecoveryHandler !== undefined) {
      wx.offNetworkStatusChange(
        networkRecoveryHandler as unknown as WechatMiniprogram.OffNetworkStatusChangeCallback,
      );
      networkRecoveryHandler = undefined;
    }
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
    const draft = updateGenerationDraft(this.getDraft(), changes);
    this.setImages(draft.images as PreparedJdImage[], {
      inputMode: draft.inputMode,
      requestId: draft.requestId,
      resumeIndex: draft.resumeIndex,
      text: draft.text,
    });
  },

  setImages(images: PreparedJdImage[], extra: Record<string, unknown> = {}): void {
    if (images.length === 0) {
      wx.removeStorageSync(JD_UPLOAD_DRAFT_KEY);
    } else {
      wx.setStorageSync(JD_UPLOAD_DRAFT_KEY, images);
    }
    this.setData({ images, ...imageUploadView(images), ...extra });
  },

  updateImage(localId: string, changes: Partial<PreparedJdImage>): void {
    const images = this.data.images.map((image) =>
      image.localId === localId ? { ...image, ...changes } : image
    );
    this.setImages(images);
  },

  async chooseImages(): Promise<void> {
    if (this.data.preparingImages) {
      return;
    }
    const remaining = MAX_JD_IMAGE_COUNT - this.data.images.length;
    if (remaining <= 0) {
      this.setData({ errorMessage: "岗位截图最多选择 5 张。" });
      return;
    }
    try {
      this.setData({ preparingImages: true });
      const response = await wx.chooseMedia({
        count: remaining,
        mediaType: ["image"],
        sizeType: ["original"],
        sourceType: ["album", "camera"],
      });
      const selectedAtMs = Date.now();
      const images = response.tempFiles.map(({ size, tempFilePath }) => ({
        completedAtMs: 0,
        fileId: "",
        localId: createRequestId(),
        path: tempFilePath,
        selectedAtMs,
        size,
        uploadDurationMs: 0,
        uploadErrorCode: "" as const,
        uploadState: "local" as const,
      }));
      const result = appendJdImages(this.getDraft(), images);
      if (!result.valid) {
        this.setData({ errorMessage: result.message, preparingImages: false });
        return;
      }
      this.setImages(result.draft.images as PreparedJdImage[], {
        errorMessage: "",
        preparingImages: false,
        requestId: result.draft.requestId,
      });
      void this.startPendingUploads(false);
    } catch (error) {
      if (error instanceof Error && /cancel/u.test(error.message)) {
        this.setData({ preparingImages: false });
        return;
      }
      this.setData({ errorMessage: messageFrom(error), preparingImages: false });
    }
  },

  removeImage(event: WechatMiniprogram.BaseEvent): void {
    const index = Number(event.currentTarget.dataset.index);
    const image = this.data.images[index];
    const fileId = image?.fileId;
    if (fileId) {
      void wx.cloud.deleteFile({ fileList: [fileId] }).catch(() => undefined);
    }
    const draft = removeJdImage(this.getDraft(), index);
    this.setImages(draft.images as PreparedJdImage[], {
      errorMessage: "",
      requestId: draft.requestId,
    });
  },

  async startPendingUploads(includeFailed: boolean): Promise<void> {
    if (this.data.uploadPumpActive) return;
    const pendingIds = this.data.images
      .filter(({ uploadState }) => uploadState === "local" || (includeFailed && uploadState === "failed"))
      .map(({ localId }) => localId);
    if (pendingIds.length === 0) return;
    this.setData({ uploadPumpActive: true });
    await runWithConcurrency(pendingIds, 3, async (localId) => {
      const image = this.data.images.find((candidate) => candidate.localId === localId);
      if (image === undefined || (image.uploadState !== "local" && image.uploadState !== "failed")) {
        return;
      }
      const startedAt = Date.now();
      this.updateImage(localId, {
        uploadErrorCode: "",
        uploadState: "uploading",
      });
      try {
        const fileId = await uploadTemporaryFile(image.path);
        if (!this.data.images.some((candidate) => candidate.localId === localId)) {
          await wx.cloud.deleteFile({ fileList: [fileId] }).catch(() => undefined);
          return;
        }
        this.updateImage(localId, {
          completedAtMs: Date.now(),
          fileId,
          uploadDurationMs: Date.now() - startedAt,
          uploadErrorCode: "",
          uploadState: "uploaded",
        });
      } catch (error) {
        if (this.data.images.some((candidate) => candidate.localId === localId)) {
          this.updateImage(localId, {
            completedAtMs: Date.now(),
            fileId: "",
            uploadDurationMs: Date.now() - startedAt,
            uploadErrorCode: isWeakNetwork(error) ? "NETWORK_ERROR" : "UPLOAD_FAILED",
            uploadState: "failed",
          });
        }
      }
    });
    this.setData({ uploadPumpActive: false });
    if (this.data.images.some(({ uploadState }) => uploadState === "local")) {
      void this.startPendingUploads(false);
    }
  },

  async resumeFailedUploads(): Promise<void> {
    const images = this.data.images.map((image) =>
      image.uploadState === "failed"
        ? { ...image, uploadErrorCode: "" as const, uploadState: "local" as const }
        : image
    );
    this.setImages(images, { errorMessage: "", weakNetwork: false });
    await this.startPendingUploads(false);
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
    this.setImages(draft.images as PreparedJdImage[], {
      inputMode: draft.inputMode,
      requestId: draft.requestId,
      resumeIndex: draft.resumeIndex,
      text: draft.text,
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
    if (activeInput.inputType === "images" && !this.data.imagesReady) {
      this.setData({
        errorMessage: this.data.failedUploadCount > 0
          ? "有截图上传失败，请只重试失败图片。"
          : "截图仍在上传，请等待上传完成。",
      });
      return;
    }
    const requestId = this.data.requestId || createRequestId();
    this.setData({ errorMessage: "", loading: true, requestId, weakNetwork: false });
    try {
      const submittedInput = activeInput.inputType === "images"
        ? {
            inputType: "images" as const,
            fileIds: this.data.images.map(({ fileId }) => fileId),
          }
        : activeInput;
      const selectedAtMs = this.data.images.length > 0
        ? Math.min(...this.data.images.map(({ selectedAtMs: value }) => value))
        : Date.now();
      const completedAtMs = this.data.images.length > 0
        ? Math.max(...this.data.images.map(({ completedAtMs: value }) => value))
        : selectedAtMs;
      const apiCreateStartedAt = Date.now();
      const result = await runtime().api.write<{ jobId: string }>("generation.create", {
        ...submittedInput,
        clientBackgroundUploadMs: activeInput.inputType === "images"
          ? Math.max(0, completedAtMs - selectedAtMs)
          : 0,
        clientImagePreparationMs: activeInput.inputType === "images"
          ? Math.max(0, completedAtMs - selectedAtMs)
          : 0,
        clientSelectionToCreateMs: activeInput.inputType === "images"
          ? Math.max(0, Date.now() - selectedAtMs)
          : 0,
        clientUploadMs: activeInput.inputType === "images"
          ? Math.max(0, ...this.data.images.map(({ uploadDurationMs }) => uploadDurationMs))
          : 0,
        clientCompressedCount: 0,
        clientCompressionMs: 0,
        originalBytes: activeInput.inputType === "images"
          ? this.data.images.reduce((total, { size }) => total + size, 0)
          : 0,
        clientPipelineVersion: "jd-submit-v6-background-upload",
        resumeId: resume.resumeId,
      }, requestId);
      runtime().setLastJobId(result.jobId);
      runtime().setJobTiming(result.jobId, {
        apiCreateMs: Date.now() - apiCreateStartedAt,
        selectionStartedAtMs: selectedAtMs,
      });
      this.setData({ loading: false, requestId: "" });
      if (activeInput.inputType === "text") {
        const unusedFileIds = this.data.images.flatMap(({ fileId }) => fileId ? [fileId] : []);
        if (unusedFileIds.length > 0) {
          void wx.cloud.deleteFile({ fileList: unusedFileIds }).catch(() => undefined);
        }
      }
      this.setImages([]);
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
