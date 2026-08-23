import { describe, expect, it, vi } from "vitest";

import {
  extractLocalResumeText,
  prepareResumeFilePayload,
} from "../../web/src/lib/resume-document.js";

function syntheticPdf(text: string | null): Uint8Array {
  const escaped = text?.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const content = escaped === undefined ? "q Q" : `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "ascii"));
}

describe("Web resume local extraction", () => {
  it("extracts selectable PDF text before any CloudBase upload", async () => {
    const file = new File([syntheticPdf("Monash FinTech Resume")], "resume.pdf", {
      type: "application/pdf",
    });

    await expect(extractLocalResumeText([file])).resolves.toEqual({
      inputType: "text",
      text: "Monash FinTech Resume",
    });

    const upload = vi.fn();
    await expect(prepareResumeFilePayload([file], upload)).resolves.toEqual({
      inputType: "text",
      text: "Monash FinTech Resume",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("falls back to the existing cloud path for scanned PDFs and non-PDF files", async () => {
    const scanned = new File([syntheticPdf(null)], "scan.pdf", { type: "application/pdf" });
    const docx = new File(["docx"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(extractLocalResumeText([scanned])).resolves.toBeUndefined();
    await expect(extractLocalResumeText([docx])).resolves.toBeUndefined();

    const upload = vi.fn(async () => [{
      accessUrl: "https://example.tcb.qcloud.la/resume.pdf?sign=temporary",
      fileId: "cloud://env.bucket/temporary/resume.pdf",
    }]);
    await expect(prepareResumeFilePayload([scanned], upload)).resolves.toEqual({
      fileAccessUrls: ["https://example.tcb.qcloud.la/resume.pdf?sign=temporary"],
      fileIds: ["cloud://env.bucket/temporary/resume.pdf"],
      inputType: "pdf",
    });
    expect(upload).toHaveBeenCalledOnce();
  });
});
