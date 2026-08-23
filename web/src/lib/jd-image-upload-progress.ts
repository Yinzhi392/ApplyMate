import type { JdImageProfile } from "./jd-image-profile";
import type { TemporaryUpload, TemporaryUploadPort } from "./temporary-upload-adapter";

export interface PreparedJdUpload extends TemporaryUpload {
  originalBytes: number;
  preparedBytes: number;
  preparationMs: number;
  profileId: JdImageProfile["id"];
  uploadMs: number;
}

export interface JdImageUploadProgress {
  failedAt?: "preparation" | "upload";
  index: number;
  originalBytes: number;
  preparationMs?: number;
  preparedBytes?: number;
  profileId: JdImageProfile["id"];
  stage: "failed" | "preparing" | "uploaded" | "uploading";
  uploadMs?: number;
}

export type JdImageProgressReporter = (progress: JdImageUploadProgress) => void;
export type JdImagePreparer = (file: File, profile: JdImageProfile) => Promise<File>;

function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return "未完成";
  return milliseconds < 1_000
    ? `${milliseconds} 毫秒`
    : `${(milliseconds / 1_000).toFixed(1)} 秒`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function describeJdImageUploadProgress(
  progress: readonly JdImageUploadProgress[],
  totalFiles: number,
): string {
  if (totalFiles === 0 || progress.length === 0) return "";
  const failed = progress.find(({ stage }) => stage === "failed");
  if (failed !== undefined) {
    return failed.failedAt === "preparation"
      ? `第 ${failed.index + 1} 张图片本地压缩失败（已用 ${formatDuration(failed.preparationMs)}）。`
      : `第 ${failed.index + 1} 张图片：本地纯压缩 ${formatDuration(failed.preparationMs)}，网络上传用时 ${formatDuration(failed.uploadMs)}，随后失败。`;
  }
  const uploaded = progress.filter(({ stage }) => stage === "uploaded");
  if (uploaded.length === totalFiles) {
    const originalBytes = uploaded.reduce((sum, item) => sum + item.originalBytes, 0);
    const preparedBytes = uploaded.reduce((sum, item) => sum + (item.preparedBytes ?? 0), 0);
    const preparationMs = uploaded.reduce((sum, item) => sum + (item.preparationMs ?? 0), 0);
    const uploadMs = uploaded.reduce((sum, item) => sum + (item.uploadMs ?? 0), 0);
    return `后台上传完成：本地纯压缩累计 ${formatDuration(preparationMs)}，网络上传累计 ${formatDuration(uploadMs)}；${formatBytes(originalBytes)} → ${formatBytes(preparedBytes)}。`;
  }
  const uploading = progress.find(({ stage }) => stage === "uploading");
  if (uploading !== undefined) {
    return `第 ${uploading.index + 1} 张本地纯压缩已完成（${formatDuration(uploading.preparationMs)}，${formatBytes(uploading.originalBytes)} → ${formatBytes(uploading.preparedBytes ?? 0)}），正在网络上传。`;
  }
  const preparing = progress.filter(({ stage }) => stage === "preparing").length;
  return `正在本地纯压缩 ${Math.max(1, preparing)} / ${totalFiles} 张；此阶段不做 OCR、字段分析或隐私检查。`;
}

export async function prepareAndUploadJdImagesWith(
  files: readonly File[],
  ownerId: string,
  port: TemporaryUploadPort,
  limit: number,
  profile: JdImageProfile,
  reportProgress: JdImageProgressReporter,
  prepareImage: JdImagePreparer,
): Promise<PreparedJdUpload[]> {
  const output = new Array<PreparedJdUpload>(files.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (file === undefined) continue;
      reportProgress({
        index,
        originalBytes: file.size,
        profileId: profile.id,
        stage: "preparing",
      });
      const preparationStarted = performance.now();
      let prepared: File;
      try {
        prepared = await prepareImage(file, profile);
      } catch (cause) {
        reportProgress({
          failedAt: "preparation",
          index,
          originalBytes: file.size,
          preparationMs: Math.max(0, Math.round(performance.now() - preparationStarted)),
          profileId: profile.id,
          stage: "failed",
        });
        throw cause;
      }
      const preparationMs = Math.max(0, Math.round(performance.now() - preparationStarted));
      reportProgress({
        index,
        originalBytes: file.size,
        preparationMs,
        preparedBytes: prepared.size,
        profileId: profile.id,
        stage: "uploading",
      });
      const uploadStarted = performance.now();
      let uploaded: TemporaryUpload;
      try {
        uploaded = await port.upload(prepared, ownerId);
      } catch (cause) {
        reportProgress({
          failedAt: "upload",
          index,
          originalBytes: file.size,
          preparationMs,
          preparedBytes: prepared.size,
          profileId: profile.id,
          stage: "failed",
          uploadMs: Math.max(0, Math.round(performance.now() - uploadStarted)),
        });
        throw cause;
      }
      const uploadMs = Math.max(0, Math.round(performance.now() - uploadStarted));
      output[index] = {
        ...uploaded,
        originalBytes: file.size,
        preparedBytes: prepared.size,
        preparationMs,
        uploadMs,
        profileId: profile.id,
      };
      reportProgress({
        index,
        originalBytes: file.size,
        preparationMs,
        preparedBytes: prepared.size,
        profileId: profile.id,
        stage: "uploaded",
        uploadMs,
      });
    }
  }));
  return output;
}
