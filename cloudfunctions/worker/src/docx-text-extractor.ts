import mammoth from "mammoth";

import { ResumeProcessingError } from "./resume-processing-error.js";

export class DocxTextExtractor {
  async extract(bytes: Buffer): Promise<string> {
    let value: string;
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      value = result.value.trim();
    } catch {
      throw new ResumeProcessingError(
        "INVALID_DOCUMENT",
        "The DOCX file could not be read.",
      );
    }
    if (value.length === 0) {
      throw new ResumeProcessingError(
        "EMPTY_DOCUMENT",
        "The DOCX file does not contain readable text.",
      );
    }
    return value;
  }
}
