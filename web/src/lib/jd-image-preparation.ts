import {
  cloudbaseTemporaryUploadPort,
  type TemporaryUpload,
  type TemporaryUploadPort,
} from "./temporary-upload";
import { JD_IMAGE_PROFILES, type JdImageProfile } from "./jd-image-profile";

export interface PreparedJdUpload extends TemporaryUpload {
  originalBytes: number;
  preparedBytes: number;
  preparationMs: number;
  profileId: JdImageProfile["id"];
  uploadMs: number;
}

export function configuredJdImageProfile(): JdImageProfile {
  const configured = import.meta.env.VITE_JD_IMAGE_PROFILE?.trim();
  return JD_IMAGE_PROFILES.find(({ id }) => id === configured) ?? JD_IMAGE_PROFILES[2];
}

function preparedFileName(file: File): string {
  const stem = file.name.replace(/\.[^.]+$/u, "").slice(0, 80) || "jd-image";
  return `${stem}.prepared.jpg`;
}

async function prepareInWorker(file: File, profile: JdImageProfile): Promise<File> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw new Error("WORKER_UNAVAILABLE");
  }
  const worker = new Worker(new URL("./jd-image.worker.ts", import.meta.url), { type: "module" });
  const id = crypto.randomUUID();
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      worker.addEventListener("message", (event: MessageEvent<{ blob?: Blob; error?: string; id: string }>) => {
        if (event.data.id !== id) return;
        if (event.data.blob === undefined) reject(new Error(event.data.error ?? "IMAGE_PREPARATION_FAILED"));
        else resolve(event.data.blob);
      });
      worker.addEventListener("error", () => reject(new Error("IMAGE_PREPARATION_FAILED")));
      worker.postMessage({ file, id, maxEdge: profile.maxEdge, quality: profile.quality });
    });
    return new File([blob], preparedFileName(file), { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    worker.terminate();
  }
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareOnMainThread(file: File, profile: JdImageProfile): Promise<File> {
  const image = await loadImage(file);
  const scale = Math.min(1, profile.maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) throw new Error("浏览器无法准备岗位图片，请改用文字粘贴。");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (candidate) => candidate === null ? reject(new Error("图片压缩失败。")) : resolve(candidate),
    "image/jpeg",
    profile.quality,
  ));
  return new File([blob], preparedFileName(file), { type: "image/jpeg", lastModified: Date.now() });
}

export async function prepareJdImage(
  file: File,
  profile: JdImageProfile = configuredJdImageProfile(),
): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("岗位截图必须是图片文件。");
  try {
    return await prepareInWorker(file, profile);
  } catch {
    return prepareOnMainThread(file, profile);
  }
}

export async function prepareAndUploadJdImages(
  files: readonly File[],
  ownerId: string,
  port: TemporaryUploadPort = cloudbaseTemporaryUploadPort,
  limit = 3,
  profile: JdImageProfile = configuredJdImageProfile(),
): Promise<PreparedJdUpload[]> {
  const output = new Array<PreparedJdUpload>(files.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (file === undefined) continue;
      const preparationStarted = performance.now();
      const prepared = await prepareJdImage(file, profile);
      const preparationMs = Math.max(0, Math.round(performance.now() - preparationStarted));
      const uploadStarted = performance.now();
      const uploaded = await port.upload(prepared, ownerId);
      output[index] = {
        ...uploaded,
        originalBytes: file.size,
        preparedBytes: prepared.size,
        preparationMs,
        uploadMs: Math.max(0, Math.round(performance.now() - uploadStarted)),
        profileId: profile.id,
      };
    }
  }));
  return output;
}
