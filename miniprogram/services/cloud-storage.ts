import { createRequestId } from "./api-client.js";

function extensionFrom(path: string): string {
  const match = path.toLowerCase().match(/\.([a-z0-9]{1,8})(?:\?.*)?$/u);
  return match?.[1] ?? "bin";
}

export async function uploadTemporaryFiles(paths: readonly string[]): Promise<string[]> {
  const uploaded: string[] = [];
  try {
    for (const path of paths) {
      const nonce = createRequestId().replaceAll("-", "");
      const cloudPath = `temporary/${Date.now()}-${nonce}.${extensionFrom(path)}`;
      const response = await wx.cloud.uploadFile({ cloudPath, filePath: path });
      if (typeof response.fileID !== "string" || response.fileID === "") {
        throw new Error("文件上传失败，请重试。");
      }
      uploaded.push(response.fileID);
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length > 0) {
      await wx.cloud.deleteFile({ fileList: uploaded }).catch(() => undefined);
    }
    throw error;
  }
}
