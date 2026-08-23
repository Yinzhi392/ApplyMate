import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTemporaryUploadPort } from "../../web/src/lib/temporary-upload-adapter";

const sdk = {
  deleteFile: vi.fn(async (_options: { fileList: string[] }) => ({})),
  getTempFileURL: vi.fn(async ({ fileList }: { fileList: string[] }) => ({
    fileList: [{ fileID: fileList[0], tempFileURL: "https://storage.example/signed" }],
  })),
  uploadFile: vi.fn(async (_options: { cloudPath: string; filePath: File }) => ({
    fileID: "cloud://synthetic.bucket/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/file.jpg",
  })),
};

const uploadPort = createTemporaryUploadPort(async () => sdk);

describe("Web temporary upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the browser File as CloudBase filePath so upload signing uses its real byte length", async () => {
    const file = new File(["real-image-bytes"], "岗位截图.jpg", { type: "image/jpeg" });

    await expect(uploadPort.upload(
      file,
      "user_aaaaaaaaaaaaaaaaaaaaaaaa",
    )).resolves.toMatchObject({
      accessUrl: "https://storage.example/signed",
    });

    expect(sdk.uploadFile).toHaveBeenCalledTimes(1);
    const options = sdk.uploadFile.mock.calls[0]?.[0];
    if (options === undefined) throw new Error("Expected one CloudBase upload call.");
    expect(options.filePath).toBe(file);
    expect(options).not.toHaveProperty("fileContent");
  });

  it("does not expose the CloudBase storage wrapper error to users", async () => {
    sdk.uploadFile.mockRejectedValueOnce(new Error("[@cloudbase/js-sdk][OPERATION_FAIL][storage]:"));
    const file = new File(["real-image-bytes"], "岗位截图.jpg", { type: "image/jpeg" });

    await expect(uploadPort.upload(
      file,
      "user_aaaaaaaaaaaaaaaaaaaaaaaa",
    )).rejects.toThrow("图片上传失败，请检查网络后重新选择图片。");
  });
});
