import { createPreferenceDraft } from "../../core/input-rules.js";
import { messageFrom, showSuccess } from "../../services/page-utils.js";
import { runtime } from "../../services/runtime.js";

type TextInputEvent = WechatMiniprogram.CustomEvent<{ value: string }>;

Page({
  data: {
    errorMessage: "",
    loading: true,
    message: "",
    segments: [] as string[],
    text: "",
    valid: true,
    visibleCharacters: 0,
  },

  onLoad(): void {
    void this.loadPreferences();
  },

  async loadPreferences(): Promise<void> {
    this.setData({ errorMessage: "", loading: true });
    try {
      const response = await runtime().api.read<{ user: { preferenceText: string } }>("user.get", {});
      this.applyDraft(response.user.preferenceText);
      this.setData({ loading: false });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  updateText(event: TextInputEvent): void {
    this.applyDraft(event.detail.value);
  },

  applyDraft(text: string): void {
    const draft = createPreferenceDraft(text);
    this.setData({
      message: draft.message,
      segments: draft.segments,
      text,
      valid: draft.valid,
      visibleCharacters: draft.visibleCharacters,
    });
  },

  async save(): Promise<void> {
    if (!this.data.valid) {
      return;
    }
    this.setData({ errorMessage: "", loading: true });
    try {
      await runtime().api.write("user.updatePreferences", { preferenceText: this.data.text });
      showSuccess("偏好已保存");
      this.setData({ loading: false });
    } catch (error) {
      this.setData({ errorMessage: messageFrom(error), loading: false });
    }
  },

  clear(): void {
    this.applyDraft("");
    void this.save();
  },
});
