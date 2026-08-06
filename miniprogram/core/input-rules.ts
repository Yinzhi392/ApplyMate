const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_PREFERENCE_CHARACTERS = 500;

export interface SelectedDocument {
  name: string;
  size: number;
}

export interface SelectedImage {
  path: string;
  size: number;
}

export type InputValidation =
  | { valid: true; kind?: "pdf" | "docx" }
  | { valid: false; message: string };

export function countVisibleCharacters(value: string): number {
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
    .filter((segment) => !/^\s+$/u.test(segment)).length;
}

export function validateResumeDocument(file: SelectedDocument): InputValidation {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
  if (extension === "doc") {
    return { valid: false, message: "暂不支持 DOC，请另存为 DOCX 或 PDF。" };
  }
  if (extension !== "pdf" && extension !== "docx") {
    return { valid: false, message: "请选择 PDF 或 DOCX 文件。" };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, message: "文件为空或无法读取。" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, message: "单个文件不能超过 10MB。" };
  }
  return { valid: true, kind: extension };
}

export function validateImageSelection(images: readonly SelectedImage[]): InputValidation {
  if (images.length === 0) {
    return { valid: false, message: "请至少选择 1 张图片。" };
  }
  if (images.length > MAX_IMAGES) {
    return { valid: false, message: "最多选择 6 张图片。" };
  }
  const totalBytes = images.reduce((sum, image) => sum + image.size, 0);
  if (totalBytes > MAX_FILE_BYTES) {
    return { valid: false, message: "图片总大小不能超过 10MB。" };
  }
  if (images.some(({ size }) => !Number.isFinite(size) || size <= 0)) {
    return { valid: false, message: "有图片为空或无法读取。" };
  }
  return { valid: true };
}

export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const result = [...items];
  const [item] = result.splice(fromIndex, 1);
  if (item !== undefined) {
    result.splice(toIndex, 0, item);
  }
  return result;
}

export interface PreferenceDraft {
  text: string;
  visibleCharacters: number;
  valid: boolean;
  segments: string[];
  message: string;
}

export function createPreferenceDraft(text: string): PreferenceDraft {
  const visibleCharacters = countVisibleCharacters(text);
  const segments = text
    .split(/[。！？!?；;\n]+/gu)
    .map((segment) => segment.replace(/\s+/gu, " ").trim())
    .filter((segment, index, all) => segment !== "" && all.indexOf(segment) === index);
  const valid = visibleCharacters <= MAX_PREFERENCE_CHARACTERS;
  return {
    text,
    visibleCharacters,
    valid,
    segments,
    message: valid ? "" : "求职偏好最多 500 个可见字符。",
  };
}
