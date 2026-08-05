import { describe, expect, it } from "vitest";

import {
  OcrProviderError,
  TencentOcrAdapter,
  type OcrProvider,
  type ValidatedImageFileReader,
} from "../../cloudfunctions/worker/src/index.js";

const image = {
  fileId: "file_synthetic_image",
  ownerUserId: "user_synthetic_a",
  mimeType: "image/jpeg",
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  validatedKind: "images" as const,
};

class SyntheticImageReader implements ValidatedImageFileReader {
  async getValidatedImage(
    ownerUserId: string,
    fileId: string,
  ): Promise<typeof image | null> {
    return ownerUserId === image.ownerUserId && fileId === image.fileId
      ? image
      : null;
  }
}

describe("Tencent OCR adapter contract", () => {
  it("sends only an owned validated image and returns usage metadata", async () => {
    const calls: Buffer[] = [];
    const provider: OcrProvider = {
      recognize: async (input) => {
        calls.push(Buffer.from(input.bytes));
        return {
          text: "Synthetic resume text",
          confidence: 0.96,
          providerRequestId: "ocr_request_synthetic",
          durationMs: 321,
          usageUnits: 1,
        };
      },
    };
    const adapter = new TencentOcrAdapter(new SyntheticImageReader(), provider);

    await expect(
      adapter.recognize(image.ownerUserId, image.fileId),
    ).resolves.toEqual({
      text: "Synthetic resume text",
      confidence: 0.96,
      providerRequestId: "ocr_request_synthetic",
      durationMs: 321,
      usageUnits: 1,
    });
    expect(calls).toEqual([image.bytes]);
  });

  it("rejects cross-user or unvalidated images before provider access", async () => {
    let calls = 0;
    const adapter = new TencentOcrAdapter(new SyntheticImageReader(), {
      recognize: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    });

    await expect(
      adapter.recognize("user_synthetic_b", image.fileId),
    ).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
    expect(calls).toBe(0);
  });

  it("normalizes low confidence, timeout, 429, and free-resource exhaustion", async () => {
    const outcomes: readonly [
      "low" | "timeout" | "rate_limited" | "resource_paused",
      string,
      boolean,
    ][] = [
      ["low", "OCR_LOW_CONFIDENCE", false],
      ["timeout", "OCR_TIMEOUT", true],
      ["rate_limited", "OCR_RATE_LIMITED", true],
      ["resource_paused", "OCR_RESOURCE_PAUSED", true],
    ];

    for (const [outcome, code, retryable] of outcomes) {
      const provider: OcrProvider = {
        recognize: async () => {
          if (outcome === "low") {
            return {
              text: "uncertain",
              confidence: 0.2,
              providerRequestId: "ocr_low",
              durationMs: 100,
              usageUnits: 1,
            };
          }
          throw new OcrProviderError(outcome);
        },
      };

      await expect(
        new TencentOcrAdapter(new SyntheticImageReader(), provider).recognize(
          image.ownerUserId,
          image.fileId,
        ),
      ).rejects.toMatchObject({ code, retryable });
    }
  });
});
