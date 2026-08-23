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

export interface StorageDiagnostic {
  code?: string;
  message?: string;
  requestId?: string;
  stage: "access_url" | "upload";
  status?: number;
}

type StorageDiagnosticReporter = (diagnostic: StorageDiagnostic) => void;

function safeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value
    .replace(/https?:\/\/\S+/giu, "[url]")
    .replace(/cloud:\/\/\S+/giu, "[file]")
    .slice(0, 240);
}

function diagnosticRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function storageDiagnostic(cause: unknown, stage: StorageDiagnostic["stage"]): StorageDiagnostic {
  const outer = diagnosticRecord(cause);
  const inner = diagnosticRecord(outer?.cause);
  const read = (...keys: string[]): unknown => {
    for (const record of [outer, inner]) {
      for (const key of keys) {
        if (record?.[key] !== undefined) return record[key];
      }
    }
    return undefined;
  };
  const rawStatus = read("status", "statusCode");
  const code = safeDiagnosticText(read("code", "errCode", "errorCode"));
  const message = safeDiagnosticText(read("message"));
  const requestId = safeDiagnosticText(read("requestId", "requestID"));
  return {
    stage,
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(typeof rawStatus === "number" && Number.isFinite(rawStatus) ? { status: rawStatus } : {}),
  };
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
  reportDiagnostic: StorageDiagnosticReporter = () => undefined,
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
        reportDiagnostic(storageDiagnostic(cause, "upload"));
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
        reportDiagnostic(storageDiagnostic(cause, "access_url"));
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
