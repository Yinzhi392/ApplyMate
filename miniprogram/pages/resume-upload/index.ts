import {
  validateResumeImageSelection,
  validateResumeDocument,
  type SelectedImage,
} from "../../core/input-rules.js";
import { messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type UploadInputType = "pdf" | "docx" | "images";

Page({
  data: {
    documentPath: "",
    errorMessage: "",
    images: [] as SelectedImage[],
    inputType: "pdf" as "pdf" | "docx" | "images" | "text",
    loading: false,
    selectedName: "",
    selectedSize: 0,
    text: "",
    uploadInputType: "pdf" as UploadInputType,
  },

  changeResumeMode(event: WechatMiniprogram.BaseEvent): void {
    const mode = String(event.currentTarget.dataset.mode);
    if (mode === "text") {
      this.setData({ errorMessage: "", inputType: "text" });
      return;
    }
    if (mode === "upload") {
      this.setData({ errorMessage: "", inputType: this.data.uploadInputType });
    }
  },

  updateText(event: TextInputEvent): void {
    this.setData({ text: event.detail.value });
  },

  async chooseDocument(): Promise<void> {
    try {
      const response = await wx.chooseMessageFile({ count: 1, type: "file" });
      const selected = response.tempFiles[0];
      if (selected === undefined) {
        return;
      }
      const validation = validateResumeDocument({ name: selected.name, size: selected.size });
      if (!validation.valid) {
        this.setData({ errorMessage: validation.message });
        return;
      }
      if (validation.kind === undefined) {
        this.setData({ errorMessage: "无法识别文件类型，请重新选择 PDF 或 DOCX。" });
        return;
      }
      this.setData({
        documentPath: selected.path,
        errorMessage: "",
        inputType: validation.kind,
        selectedName: selected.name,
        selectedSize: selected.size,
        uploadInputType: validation.kind,
      });
    } catch (error) {
      if (error instanceof Error && /cancel/u.test(error.message)) {
        return;
      }
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async chooseImages(): Promise<void> {
    try {
      const response = await wx.chooseMedia({ count: 6, mediaType: ["image"], sourceType: ["album", "camera"] });
      const images = response.tempFiles.map(({ size, tempFilePath }) => ({ path: tempFilePath, size }));
      const validation = validateResumeImageSelection(images);
      if (!validation.valid) {
        this.setData({ errorMessage: validation.message });
        return;
      }
      this.setData({ errorMessage: "", images, inputType: "images", uploadInputType: "images" });
    } catch (error) {
      if (error instanceof Error && /cancel/u.test(error.message)) {
        return;
      }
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  async submit(): Promise<void> {
    const payload: Record<string, unknown> = { inputType: this.data.inputType };
    if (this.data.inputType === "text") {
      if (this.data.text.trim() === "") {
        this.setData({ errorMessage: "请先粘贴简历文字。" });
        return;
      }
      payload.text = this.data.text;
    } else if (this.data.inputType === "images") {
      const validation = validateResumeImageSelection(this.data.images);
      if (!validation.valid) {
        this.setData({ errorMessage: validation.message });
        return;
      }
      payload.fileIds = this.data.images.map(({ path }) => `demo:${path}`);
    } else {
      const validation = validateResumeDocument({
        name: this.data.selectedName,
        size: this.data.selectedSize,
      });
      if (!validation.valid) {
        this.setData({ errorMessage: validation.message });
        return;
      }
      payload.fileIds = [`demo:${this.data.documentPath}`];
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      const result = await runtime().api.write<{ jobId: string; resumeId: string }>(
        "resume.parse",
        payload,
      );
      runtime().setLastJobId(result.jobId);
      openPage(`/pages/job/index?jobId=${result.jobId}`);
      this.setData({ loading: false });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },
});
