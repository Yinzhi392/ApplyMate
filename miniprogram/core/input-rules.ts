const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_JD_IMAGE_COUNT = 5;
export const MAX_RESUME_IMAGE_COUNT = 6;
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

function validateImageSelection(
  images: readonly SelectedImage[],
  maximum: number,
  limitMessage: string,
): InputValidation {
  if (images.length === 0) {
    return { valid: false, message: "请至少选择 1 张图片。" };
  }
  if (images.length > maximum) {
    return { valid: false, message: limitMessage };
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

export function validateResumeImageSelection(
  images: readonly SelectedImage[],
): InputValidation {
  return validateImageSelection(
    images,
    MAX_RESUME_IMAGE_COUNT,
    "简历图片最多选择 6 张。",
  );
}

export function validateJdImageSelection(
  images: readonly SelectedImage[],
): InputValidation {
  return validateImageSelection(
    images,
    MAX_JD_IMAGE_COUNT,
    "岗位截图最多选择 5 张。",
  );
}

export type GenerationInputMode = "images" | "text";

export interface GenerationDraft {
  inputMode: GenerationInputMode;
  images: SelectedImage[];
  requestId: string;
  resumeIndex: number;
  text: string;
}

export function updateGenerationDraft(
  draft: GenerationDraft,
  changes: Partial<Omit<GenerationDraft, "requestId">>,
): GenerationDraft {
  return { ...draft, ...changes, requestId: "" };
}

export type AppendJdImagesResult =
  | { valid: true; draft: GenerationDraft }
  | { valid: false; draft: GenerationDraft; message: string };

export function appendJdImages(
  draft: GenerationDraft,
  images: readonly SelectedImage[],
): AppendJdImagesResult {
  const combined = [...draft.images, ...images];
  const validation = validateJdImageSelection(combined);
  if (!validation.valid) {
    return { valid: false, draft, message: validation.message };
  }
  return {
    valid: true,
    draft: updateGenerationDraft(draft, { images: combined }),
  };
}

export function removeJdImage(draft: GenerationDraft, index: number): GenerationDraft {
  if (index < 0 || index >= draft.images.length) {
    return draft;
  }
  return updateGenerationDraft(draft, {
    images: draft.images.filter((_, imageIndex) => imageIndex !== index),
  });
}

export function reorderJdImage(
  draft: GenerationDraft,
  fromIndex: number,
  toIndex: number,
): GenerationDraft {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= draft.images.length ||
    toIndex >= draft.images.length ||
    fromIndex === toIndex
  ) {
    return draft;
  }
  return updateGenerationDraft(draft, {
    images: moveItem(draft.images, fromIndex, toIndex),
  });
}

export type ActiveGenerationInput =
  | { inputType: "images"; fileIds: string[] }
  | { inputType: "text"; text: string };

export function buildActiveGenerationInput(
  draft: GenerationDraft,
): ActiveGenerationInput | undefined {
  if (draft.inputMode === "images") {
    const validation = validateJdImageSelection(draft.images);
    return validation.valid
      ? { inputType: "images", fileIds: draft.images.map(({ path }) => `demo:${path}`) }
      : undefined;
  }
  const text = draft.text.trim();
  return text === "" ? undefined : { inputType: "text", text };
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
