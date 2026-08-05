import { describe, expect, it } from "vitest";

import { MAX_PDF_PAGES } from "../../shared/src/index.js";
import { PdfTextExtractor } from "../../cloudfunctions/worker/src/index.js";

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function syntheticPdf(pageTexts: readonly (string | null)[]): Buffer {
  const objects: string[] = [];
  const pageObjectIds = pageTexts.map((_, index) => 3 + index * 2);
  const fontObjectId = 3 + pageTexts.length * 2;
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Count ${pageTexts.length} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`,
  );
  for (const [index, text] of pageTexts.entries()) {
    const contentObjectId = pageObjectIds[index]! + 1;
    const content =
      text === null
        ? "q Q"
        : `BT /F1 12 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

describe("PDF plain-text extraction", () => {
  it("extracts text from one page", async () => {
    await expect(
      new PdfTextExtractor().extract(syntheticPdf(["Synthetic Resume"])),
    ).resolves.toEqual({ pageCount: 1, text: "Synthetic Resume" });
  });

  it("accepts exactly ten pages", async () => {
    const result = await new PdfTextExtractor().extract(
      syntheticPdf(
        Array.from({ length: MAX_PDF_PAGES }, (_, index) => `Page ${index + 1}`),
      ),
    );

    expect(result.pageCount).toBe(MAX_PDF_PAGES);
    expect(result.text).toContain("Page 10");
  });

  it("rejects an eleventh page before extracting all text", async () => {
    await expect(
      new PdfTextExtractor().extract(
        syntheticPdf(Array.from({ length: MAX_PDF_PAGES + 1 }, () => "Page")),
      ),
    ).rejects.toMatchObject({ code: "PDF_PAGE_LIMIT" });
  });

  it("asks for screenshots when the PDF has no text", async () => {
    await expect(
      new PdfTextExtractor().extract(syntheticPdf([null])),
    ).rejects.toMatchObject({ code: "SCANNED_PDF", retryable: false });
  });

  it("rejects damaged and encrypted PDF input safely", async () => {
    const extractor = new PdfTextExtractor();
    await expect(extractor.extract(Buffer.from("%PDF-damaged"))).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    const encrypted = Buffer.from(
      syntheticPdf(["Synthetic Resume"]).toString("ascii").replace(
        "trailer\n<<",
        "trailer\n<< /Encrypt 999 0 R",
      ),
      "ascii",
    );
    await expect(extractor.extract(encrypted)).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
  });
});
