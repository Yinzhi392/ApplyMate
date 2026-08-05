import { extractText, getDocumentProxy } from "unpdf";

import { MAX_PDF_PAGES } from "../../../shared/src/index.js";

import { ResumeProcessingError } from "./resume-processing-error.js";

export interface ExtractedPdfText {
  pageCount: number;
  text: string;
}

export class PdfTextExtractor {
  async extract(bytes: Buffer): Promise<ExtractedPdfText> {
    if (bytes.includes(Buffer.from("/Encrypt", "ascii"))) {
      throw new ResumeProcessingError(
        "INVALID_DOCUMENT",
        "Encrypted PDF files are not supported.",
      );
    }

    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new ResumeProcessingError(
          "PDF_PAGE_LIMIT",
          "The PDF exceeds the ten-page limit.",
        );
      }
      const extracted = await extractText(pdf, { mergePages: true });
      const text = extracted.text.trim();
      if (text.length === 0) {
        throw new ResumeProcessingError(
          "SCANNED_PDF",
          "No selectable text was found. Upload page screenshots instead.",
        );
      }
      return { pageCount: pdf.numPages, text };
    } catch (error) {
      if (error instanceof ResumeProcessingError) {
        throw error;
      }
      throw new ResumeProcessingError(
        "INVALID_DOCUMENT",
        "The PDF file could not be read.",
      );
    }
  }
}
