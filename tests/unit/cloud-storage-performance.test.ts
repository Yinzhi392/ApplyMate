import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareAndUploadOcrImages,
  prepareAndUploadOcrImagesWithMetrics,
  prepareOcrImagePaths,
  uploadTemporaryFiles,
} from "../../miniprogram/services/cloud-storage.js";

describe("cloud storage image preparation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prepares OCR images at the evaluated 720px and quality 80 profile", async () => {
    const compressImage = vi.fn(async ({ src }: { src: string }) => ({
      tempFilePath: `${src}.compressed.jpg`,
    }));
    vi.stubGlobal("wx", { compressImage });

    await expect(prepareOcrImagePaths(["a.png", "b.jpg"])).resolves.toEqual([
      "a.png.compressed.jpg",
      "b.jpg.compressed.jpg",
    ]);
    expect(compressImage).toHaveBeenCalledWith({
      compressedWidth: 720,
      quality: 80,
      src: "a.png",
    });
  });

  it("skips slow recompression for ordinary phone screenshots under 4 MB", async () => {
    const compressImage = vi.fn();
    const uploadFile = vi.fn(async ({ filePath }: { filePath: string }) => ({
      fileID: `cloud://${filePath}`,
    }));
    vi.stubGlobal("wx", {
      compressImage,
      cloud: { deleteFile: vi.fn(), uploadFile },
    });

    await expect(prepareAndUploadOcrImages([
      { path: "phone-shot.png", size: 2 * 1024 * 1024 },
    ])).resolves.toEqual(["cloud://phone-shot.png"]);
    expect(compressImage).not.toHaveBeenCalled();
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      filePath: "phone-shot.png",
    }));
  });

  it("uploads large phone screenshots without blocking on local recompression", async () => {
    const compressImage = vi.fn();
    const uploadFile = vi.fn(async ({ filePath }: { filePath: string }) => ({
      fileID: `cloud://${filePath}`,
    }));
    vi.stubGlobal("wx", {
      compressImage,
      cloud: { deleteFile: vi.fn(), uploadFile },
    });

    await expect(prepareAndUploadOcrImages([
      { path: "large.png", size: 5 * 1024 * 1024 },
    ])).resolves.toEqual(["cloud://large.png"]);
    expect(compressImage).not.toHaveBeenCalled();
  });

  it("returns non-content upload timing and byte diagnostics", async () => {
    vi.stubGlobal("wx", {
      cloud: {
        deleteFile: vi.fn(),
        uploadFile: vi.fn(async ({ filePath }: { filePath: string }) => ({
          fileID: `cloud://${filePath}`,
        })),
      },
    });

    await expect(prepareAndUploadOcrImagesWithMetrics([
      { path: "first.png", size: 3_000_000 },
      { path: "second.png", size: 4_500_000 },
    ])).resolves.toMatchObject({
      fileIds: ["cloud://first.png", "cloud://second.png"],
      metrics: {
        originalBytes: 7_500_000,
        clientCompressedCount: 0,
        clientCompressionMs: 0,
        clientUploadMs: expect.any(Number),
      },
    });
  });

  it("uploads independent temporary files concurrently", async () => {
    const started: string[] = [];
    const releases = new Map<string, (value: { fileID: string }) => void>();
    vi.stubGlobal("wx", {
      cloud: {
        deleteFile: vi.fn(),
        uploadFile: ({ filePath }: { filePath: string }) => {
          started.push(filePath);
          return new Promise<{ fileID: string }>((resolve) => {
            releases.set(filePath, resolve);
          });
        },
      },
    });

    const uploading = uploadTemporaryFiles(["a.jpg", "b.jpg", "c.jpg"]);
    await Promise.resolve();
    expect(started).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    for (const path of started) releases.get(path)?.({ fileID: `cloud://${path}` });
    await expect(uploading).resolves.toEqual([
      "cloud://a.jpg",
      "cloud://b.jpg",
      "cloud://c.jpg",
    ]);
  });

  it("never starts more than three temporary uploads at once", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    vi.stubGlobal("wx", {
      cloud: {
        deleteFile: vi.fn(),
        uploadFile: ({ filePath }: { filePath: string }) => new Promise<{ fileID: string }>((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          releases.push(() => {
            active -= 1;
            resolve({ fileID: `cloud://${filePath}` });
          });
        }),
      },
    });

    const uploading = uploadTemporaryFiles(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]);
    await Promise.resolve();
    expect(maximumActive).toBe(3);
    releases.splice(0, 3).forEach((release) => release());
    await Promise.resolve();
    await Promise.resolve();
    expect(maximumActive).toBe(3);
    releases.splice(0).forEach((release) => release());
    await expect(uploading).resolves.toHaveLength(5);
  });

  it("falls back to the original image when local compression fails", async () => {
    const compressImage = vi.fn()
      .mockRejectedValueOnce(new Error("unsupported image"))
      .mockResolvedValueOnce({ tempFilePath: "b.compressed.jpg" });
    vi.stubGlobal("wx", { compressImage });

    await expect(prepareOcrImagePaths(["a.heic", "b.jpg"])).resolves.toEqual([
      "a.heic",
      "b.compressed.jpg",
    ]);
  });

  it("removes successful concurrent uploads when another upload fails", async () => {
    const deleteFile = vi.fn(async () => undefined);
    vi.stubGlobal("wx", {
      cloud: {
        deleteFile,
        uploadFile: ({ filePath }: { filePath: string }) =>
          filePath === "b.jpg"
            ? Promise.reject(new Error("network failed"))
            : Promise.resolve({ fileID: `cloud://${filePath}` }),
      },
    });

    await expect(uploadTemporaryFiles(["a.jpg", "b.jpg", "c.jpg"]))
      .rejects.toThrow("network failed");
    expect(deleteFile).toHaveBeenCalledWith({
      fileList: ["cloud://a.jpg", "cloud://c.jpg"],
    });
  });

  it("uploads all selected images in parallel without waiting for phone compression", async () => {
    const uploaded: string[] = [];
    vi.stubGlobal("wx", {
      compressImage: vi.fn(() => Promise.reject(new Error("must not run"))),
      cloud: {
        deleteFile: vi.fn(),
        uploadFile: async ({ filePath }: { filePath: string }) => {
          uploaded.push(filePath);
          return { fileID: `cloud://${filePath}` };
        },
      },
    });

    await expect(prepareAndUploadOcrImages(["slow.png", "fast.png"])).resolves.toEqual([
      "cloud://slow.png",
      "cloud://fast.png",
    ]);
    expect(uploaded).toEqual(["slow.png", "fast.png"]);
    expect(wx.compressImage).not.toHaveBeenCalled();
  });
});
