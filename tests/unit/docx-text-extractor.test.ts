import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DocxTextExtractor } from "../../cloudfunctions/worker/src/index.js";

function mammothFixture(name: string): Promise<Buffer> {
  return readFile(resolve("node_modules/mammoth/test/test-data", name));
}

describe("DOCX plain-text extraction", () => {
  it("extracts ordinary paragraphs without HTML", async () => {
    const text = await new DocxTextExtractor().extract(
      await mammothFixture("single-paragraph.docx"),
    );

    expect(text).toBe("Walking on imported air");
    expect(text).not.toContain("<p");
  });

  it("retains table cell text without rendering a table", async () => {
    const text = await new DocxTextExtractor().extract(
      await mammothFixture("tables.docx"),
    );

    expect(text).toContain("Top left");
    expect(text).toContain("Bottom right");
    expect(text).not.toContain("<table");
  });

  it("rejects damaged or external-content-only documents safely", async () => {
    const extractor = new DocxTextExtractor();

    await expect(extractor.extract(Buffer.from("not-a-docx"))).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    await expect(
      extractor.extract(await mammothFixture("external-picture.docx")),
    ).rejects.toMatchObject({ code: "EMPTY_DOCUMENT" });
  });
});
