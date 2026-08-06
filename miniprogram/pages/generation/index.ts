import { moveItem, validateImageSelection, type SelectedImage } from "../../core/input-rules.js";
import { createRequestId } from "../../services/api-client.js";
import { isWeakNetwork, messageFrom, openPage } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;
type PickerEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

interface ResumeOption {
  isDefault: boolean;
  profile: { name?: string };
  resumeId: string;
  status: string;
}

Page({
  data: {
    errorMessage: "",
    images: [] as SelectedImage[],
    loading: false,
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
    this.setData({ resumeIndex: Number(event.detail.value) });
  },

  updateText(event: TextInputEvent): void {
    this.setData({ text: event.detail.value });
  },

  async chooseImages(): Promise<void> {
    try {
      const response = await wx.chooseMedia({ count: 6, mediaType: ["image"], sourceType: ["album", "camera"] });
      const images = response.tempFiles.map(({ size, tempFilePath }) => ({ path: tempFilePath, size }));
      const validation = validateImageSelection(images);
      if (!validation.valid) {
        this.setData({ errorMessage: validation.message });
        return;
      }
      this.setData({ errorMessage: "", images });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error) });
    }
  },

  moveImage(event: WechatMiniprogram.BaseEvent): void {
    const index = Number(event.currentTarget.dataset.index);
    const direction = String(event.currentTarget.dataset.direction);
    const toIndex = direction === "up" ? index - 1 : index + 1;
    this.setData({ images: moveItem(this.data.images, index, toIndex) });
  },

  async submit(): Promise<void> {
    const resume = this.data.resumes[this.data.resumeIndex];
    if (resume === undefined) {
      this.setData({ errorMessage: "请先添加并确认一份简历。" });
      return;
    }
    if (this.data.images.length === 0 && this.data.text.trim() === "") {
      this.setData({ errorMessage: "请上传岗位截图或粘贴岗位文字。" });
      return;
    }
    const imageValidation = this.data.images.length === 0
      ? { valid: true as const }
      : validateImageSelection(this.data.images);
    if (!imageValidation.valid) {
      this.setData({ errorMessage: imageValidation.message });
      return;
    }
    const requestId = this.data.requestId || createRequestId();
    this.setData({ errorMessage: "", loading: true, requestId, weakNetwork: false });
    try {
      const result = await runtime().api.write<{ jobId: string }>("generation.create", {
        fileIds: this.data.images.map(({ path }) => `demo:${path}`),
        inputType: this.data.images.length > 0 ? "images" : "text",
        resumeId: resume.resumeId,
        text: this.data.text,
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
