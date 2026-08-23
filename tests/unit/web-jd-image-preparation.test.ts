import { describe, expect, it, vi } from "vitest";

import {
  describeJdImageUploadProgress,
  prepareAndUploadJdImagesWith,
  type JdImageUploadProgress,
} from "../../web/src/lib/jd-image-upload-progress";
import { JD_IMAGE_PROFILES } from "../../web/src/lib/jd-image-profile";

describe("Web JD image preparation progress", () => {
  it("labels local compression and network upload as separate stages", () => {
    expect(describeJdImageUploadProgress([{
      failedAt: "upload",
      index: 0,
      originalBytes: 2 * 1_024 * 1_024,
      preparationMs: 280,
      preparedBytes: 320 * 1_024,
      profileId: "720-q80",
      stage: "failed",
      uploadMs: 4_600,
    }], 1)).toBe("第 1 张图片：本地纯压缩 280 毫秒，网络上传用时 4.6 秒，随后失败。");
  });

  it("separates local image preparation from network upload timing", async () => {
    const original = new File([new Uint8Array(1_000)], "岗位截图.png", { type: "image/png" });
    const prepared = new File([new Uint8Array(240)], "岗位截图.prepared.jpg", { type: "image/jpeg" });
    const progress: JdImageUploadProgress[] = [];
    const upload = vi.fn(async () => ({
      accessUrl: "https://storage.example/signed",
      fileId: "cloud://synthetic/temporary/web/file.jpg",
    }));

    const result = await prepareAndUploadJdImagesWith(
      [original],
      "user_aaaaaaaaaaaaaaaaaaaaaaaa",
      { delete: vi.fn(async () => undefined), upload },
      3,
      JD_IMAGE_PROFILES[0],
      (event) => progress.push(event),
      async () => prepared,
    );

    expect(progress.map(({ stage }) => stage)).toEqual(["preparing", "uploading", "uploaded"]);
    expect(progress[1]).toMatchObject({
      index: 0,
      originalBytes: 1_000,
      preparedBytes: 240,
      stage: "uploading",
    });
    expect(progress[2]?.preparationMs).toBeGreaterThanOrEqual(0);
    expect(progress[2]?.uploadMs).toBeGreaterThanOrEqual(0);
    expect(result[0]).toMatchObject({ originalBytes: 1_000, preparedBytes: 240 });
  });

  it("reports which stage failed without hiding the completed preparation time", async () => {
    const original = new File([new Uint8Array(1_000)], "岗位截图.png", { type: "image/png" });
    const prepared = new File([new Uint8Array(240)], "岗位截图.prepared.jpg", { type: "image/jpeg" });
    const progress: JdImageUploadProgress[] = [];

    await expect(prepareAndUploadJdImagesWith(
      [original],
      "user_aaaaaaaaaaaaaaaaaaaaaaaa",
      {
        delete: vi.fn(async () => undefined),
        upload: vi.fn(async () => Promise.reject(new Error("storage failed"))),
      },
      3,
      JD_IMAGE_PROFILES[0],
      (event) => progress.push(event),
      async () => prepared,
    )).rejects.toThrow("storage failed");

    expect(progress.at(-1)).toMatchObject({
      failedAt: "upload",
      index: 0,
      originalBytes: 1_000,
      preparedBytes: 240,
      stage: "failed",
    });
    expect(progress.at(-1)?.preparationMs).toBeGreaterThanOrEqual(0);
    expect(progress.at(-1)?.uploadMs).toBeGreaterThanOrEqual(0);
  });
});
