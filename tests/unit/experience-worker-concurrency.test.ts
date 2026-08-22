import { afterEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readInputText } = require(
  "../../cloudfunctions/worker/deploy/experience-worker.js",
) as {
  readInputText(
    app: {
      downloadFile(input: { fileID: string }): Promise<{ fileContent: Uint8Array }>;
    },
    input: { inputType: "images"; fileIds: string[] },
    credentials: { secretId: string; secretKey: string },
  ): Promise<string>;
};

describe("experience worker image concurrency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts all signed-URL OCR requests without downloading source images", async () => {
    const started: string[] = [];
    const getTempFileURL = vi.fn(async ({ fileList }: { fileList: string[] }) => ({
      fileList: fileList.map((fileID) => ({
        fileID,
        tempFileURL: `https://example.test/${fileID}`,
      })),
    }));
    const app = {
      downloadFile: vi.fn(() => Promise.reject(new Error("must not download"))),
      getTempFileURL,
    };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body?: string }) => {
      const imageUrl = JSON.parse(String(init.body)).ImageUrl as string;
      started.push(imageUrl);
      return {
        ok: true,
        json: async () => ({ Response: { TextDetections: [{ DetectedText: "岗位内容" }] } }),
      };
    }));

    const reading = readInputText(
      app,
      { inputType: "images", fileIds: ["file_1", "file_2", "file_3"] },
      { secretId: "synthetic-id", secretKey: "synthetic-key" },
    );
    await expect(reading).resolves.toBe("岗位内容\n岗位内容\n岗位内容");
    expect(started).toEqual([
      "https://example.test/file_1",
      "https://example.test/file_2",
      "https://example.test/file_3",
    ]);
    expect(app.downloadFile).not.toHaveBeenCalled();
    expect(getTempFileURL).toHaveBeenCalledTimes(1);
    expect(getTempFileURL).toHaveBeenCalledWith({
      fileList: ["file_1", "file_2", "file_3"],
    });
  });
});
