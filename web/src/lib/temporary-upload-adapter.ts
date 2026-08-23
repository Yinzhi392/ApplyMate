function safeExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/u);
  return match?.[1] ?? "bin";
}

function safeOwnerId(ownerId: string): string {
  if (!/^user_[a-f0-9]{24}$/u.test(ownerId)) {
    throw new Error("当前登录身份无效，请刷新页面后重试。");
  }
  return ownerId;
}

export interface TemporaryUpload {
  accessUrl: string;
  fileId: string;
}

export interface TemporaryUploadPort {
  delete(fileIds: readonly string[]): Promise<void>;
  upload(file: File, ownerId: string): Promise<TemporaryUpload>;
}

export interface CloudbaseStorageClient {
  deleteFile(options: { fileList: string[] }): Promise<unknown>;
  getTempFileURL(options: { fileList: string[] }): Promise<unknown>;
  uploadFile(options: { cloudPath: string; filePath: File }): Promise<{ fileID?: unknown }>;
}

function temporaryAccessUrl(response: unknown, fileId: string): string {
  if (typeof response !== "object" || response === null) return "";
  const list = (response as { fileList?: unknown }).fileList;
  if (!Array.isArray(list)) return "";
  const item = list.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return false;
    return (candidate as { fileID?: unknown }).fileID === fileId;
  }) ?? list[0];
  if (typeof item !== "object" || item === null) return "";
  const record = item as { download_url?: unknown; downloadUrl?: unknown; tempFileURL?: unknown };
  const url = record.tempFileURL ?? record.download_url ?? record.downloadUrl;
  return typeof url === "string" && url.startsWith("https://") ? url : "";
}

export function createTemporaryUploadPort(
  loadClient: () => Promise<CloudbaseStorageClient>,
): TemporaryUploadPort {
  return {
    async delete(fileIds): Promise<void> {
      if (fileIds.length === 0) return;
      await (await loadClient()).deleteFile({ fileList: [...fileIds] });
    },
    async upload(file, ownerId): Promise<TemporaryUpload> {
      const app = await loadClient();
      const cloudPath = `temporary/web/${safeOwnerId(ownerId)}/${Date.now()}-${crypto.randomUUID()}.${safeExtension(file.name)}`;
      let response: { fileID?: unknown };
      try {
        response = await app.uploadFile({ cloudPath, filePath: file });
      } catch (cause) {
        throw new Error("图片上传失败，请检查网络后重新选择图片。", { cause });
      }
      if (typeof response.fileID !== "string" || response.fileID.length === 0) {
        throw new Error("文件上传失败，请重试。");
      }
      try {
        const accessResponse = await app.getTempFileURL({ fileList: [response.fileID] });
        const accessUrl = temporaryAccessUrl(accessResponse, response.fileID);
        if (accessUrl === "") throw new Error("文件读取授权失败，请重新上传后重试。");
        return { accessUrl, fileId: response.fileID };
      } catch (cause) {
        await app.deleteFile({ fileList: [response.fileID] }).catch(() => undefined);
        throw cause instanceof Error ? cause : new Error("文件读取授权失败，请重新上传后重试。");
      }
    },
  };
}

export async function uploadWithConcurrency(
  files: readonly File[],
  ownerId: string,
  limit: number,
  port: TemporaryUploadPort,
): Promise<TemporaryUpload[]> {
  const output = new Array<TemporaryUpload>(files.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (file !== undefined) output[index] = await port.upload(file, ownerId);
    }
  }));
  return output;
}
