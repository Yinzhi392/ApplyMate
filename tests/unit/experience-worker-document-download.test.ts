import { afterEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readInputTextDetailed } = require(
  "../../cloudfunctions/worker/deploy/experience-worker.js",
) as {
  readInputTextDetailed: (
    app: {
      downloadFile: (input: { fileID: string }) => Promise<unknown>;
      getTempFileURL: (input: { fileList: string[] }) => Promise<unknown>;
    },
    input: { fileAccessUrls?: string[]; fileIds: string[]; inputType: string },
    credentials: Record<string, never>,
  ) => Promise<{ ocrTransportMode: string; text: string }>;
};

const TEXT_PDF = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 72 720 Td (ApplyMate Resume) Tj ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`);

describe("experience worker document download", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a PDF from its signed URL when the legacy SDK download is unavailable", async () => {
    const downloadFile = vi.fn().mockRejectedValue(new Error("legacy download unavailable"));
    const getTempFileURL = vi.fn().mockResolvedValue({
      fileList: [
        {
          fileID: "cloud://applymate/temporary/resume.pdf",
          tempFileURL: "https://storage.example/resume.pdf",
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(TEXT_PDF, {
          headers: { "content-type": "application/pdf" },
          status: 200,
        }),
      ),
    );

    const result = await readInputTextDetailed(
      { downloadFile, getTempFileURL },
      {
        fileIds: ["cloud://applymate/temporary/resume.pdf"],
        inputType: "pdf",
      },
      {},
    );

    expect(result.text).toBe("ApplyMate Resume");
    expect(result.ocrTransportMode).toBe("document_url");
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("reads an email user's private PDF from the creator-issued URL when worker signing is denied", async () => {
    const fileId = "cloud://env.bucket/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/resume.pdf";
    const accessUrl = "https://bucket.tcb.qcloud.la/temporary/web/user_aaaaaaaaaaaaaaaaaaaaaaaa/resume.pdf?sign=creator";
    const downloadFile = vi.fn().mockRejectedValue(new Error("PRIVATE_ACL_DENIED"));
    const getTempFileURL = vi.fn().mockRejectedValue(new Error("PRIVATE_ACL_DENIED"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(TEXT_PDF, { status: 200 })));

    const result = await readInputTextDetailed(
      { downloadFile, getTempFileURL },
      { fileAccessUrls: [accessUrl], fileIds: [fileId], inputType: "pdf" },
      {},
    );

    expect(result.text).toBe("ApplyMate Resume");
    expect(result.ocrTransportMode).toBe("document_url");
    expect(getTempFileURL).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
  });
});
