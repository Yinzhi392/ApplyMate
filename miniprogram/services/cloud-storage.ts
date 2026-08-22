import { createRequestId } from "./api-client.js";

function extensionFrom(path: string): string {
  const match = path.toLowerCase().match(/\.([a-z0-9]{1,8})(?:\?.*)?$/u);
  return match?.[1] ?? "bin";
}

export async function uploadTemporaryFiles(paths: readonly string[]): Promise<string[]> {
  const results = await runWithConcurrency(paths, 3, uploadTemporaryFile);
  const uploaded = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed !== undefined) {
    if (uploaded.length > 0) {
      await wx.cloud.deleteFile({ fileList: uploaded }).catch(() => undefined);
    }
    throw failed.reason;
  }
  return uploaded;
}

export async function uploadTemporaryFile(path: string): Promise<string> {
  const nonce = createRequestId().replaceAll("-", "");
  const cloudPath = `temporary/${Date.now()}-${nonce}.${extensionFrom(path)}`;
  const response = await wx.cloud.uploadFile({ cloudPath, filePath: path });
  if (typeof response.fileID !== "string" || response.fileID === "") {
    throw new Error("文件上传失败，请重试。");
  }
  return response.fileID;
}

export async function runWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  maximumConcurrency: number,
  run: (input: Input, index: number) => Promise<Output>,
): Promise<Array<PromiseSettledResult<Output>>> {
  const results = new Array<PromiseSettledResult<Output>>(inputs.length);
  const workerCount = Math.min(
    inputs.length,
    Math.max(1, Math.trunc(maximumConcurrency)),
  );
  let nextIndex = 0;
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const input = inputs[index];
      if (input === undefined) continue;
      try {
        results[index] = { status: "fulfilled", value: await run(input, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

type OcrImageInput = string | { path: string; size: number };

const MAX_DIRECT_OCR_UPLOAD_BYTES = 4 * 1024 * 1024;

function imagePath(input: OcrImageInput): string {
  return typeof input === "string" ? input : input.path;
}

async function prepareOcrImagePath(input: OcrImageInput): Promise<string> {
  const path = imagePath(input);
  if (
    typeof input !== "string" &&
    Number.isFinite(input.size) &&
    input.size > 0 &&
    input.size <= MAX_DIRECT_OCR_UPLOAD_BYTES
  ) return path;
  try {
    const result = await wx.compressImage({
      compressedWidth: 720,
      quality: 80,
      src: path,
    });
    return typeof result.tempFilePath === "string" && result.tempFilePath !== ""
      ? result.tempFilePath
      : path;
  } catch {
    return path;
  }
}

export async function prepareOcrImagePaths(paths: readonly string[]): Promise<string[]> {
  return Promise.all(paths.map(prepareOcrImagePath));
}

export async function prepareAndUploadOcrImages(paths: readonly OcrImageInput[]): Promise<string[]> {
  return (await prepareAndUploadOcrImagesWithMetrics(paths)).fileIds;
}

export interface OcrImageUploadMetrics {
  originalBytes: number;
  clientCompressedCount: number;
  clientCompressionMs: number;
  clientUploadMs: number;
}

export async function prepareAndUploadOcrImagesWithMetrics(
  paths: readonly OcrImageInput[],
): Promise<{ fileIds: string[]; metrics: OcrImageUploadMetrics }> {
  const uploadStartedAt = Date.now();
  const results = await runWithConcurrency(
    paths,
    3,
    async (input) => uploadTemporaryFile(imagePath(input)),
  );
  const uploaded = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed !== undefined) {
    if (uploaded.length > 0) {
      await wx.cloud.deleteFile({ fileList: uploaded }).catch(() => undefined);
    }
    throw failed.reason;
  }
  return {
    fileIds: uploaded,
    metrics: {
      originalBytes: paths.reduce((total, input) =>
        total + (typeof input === "string" || !Number.isFinite(input.size) || input.size <= 0
          ? 0
          : Math.trunc(input.size)), 0),
      clientCompressedCount: 0,
      clientCompressionMs: 0,
      clientUploadMs: Date.now() - uploadStartedAt,
    },
  };
}
