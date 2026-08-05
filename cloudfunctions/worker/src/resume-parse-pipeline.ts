import {
  MAX_TEXT_VISIBLE_CHARACTERS,
  countVisibleCharacters,
  hasValidUnicode,
  type ResumeProfile,
  type SensitiveDataType,
} from "../../../shared/src/index.js";

import type { DocxTextExtractor } from "./docx-text-extractor.js";
import type { PdfTextExtractor } from "./pdf-text-extractor.js";
import { ResumePrivacyGateway } from "./resume-privacy-gateway.js";
import { ResumeProcessingError } from "./resume-processing-error.js";
import type { ResumeStructureParser } from "./resume-structure-parser.js";
import type { TencentOcrAdapter } from "./tencent-ocr-adapter.js";

export interface ResumeParseSource {
  resumeId: string;
  userId: string;
  inputType: "text" | "pdf" | "docx" | "images";
  temporaryFileIds: string[];
  sourceText?: string;
}

export interface ValidatedResumeSourceFile {
  fileId: string;
  bytes: Buffer;
}

export interface ValidatedResumeSourceFileReader {
  readValidatedFile(
    ownerUserId: string,
    fileId: string,
    inputType: "pdf" | "docx",
  ): Promise<ValidatedResumeSourceFile | null>;
}

export interface ResumeParsePipelineDependencies {
  files: ValidatedResumeSourceFileReader;
  docx: Pick<DocxTextExtractor, "extract">;
  pdf: Pick<PdfTextExtractor, "extract">;
  ocr: Pick<TencentOcrAdapter, "recognize">;
  parser: ResumeStructureParser;
}

export interface ParsedResumeResult {
  profile: ResumeProfile;
  maskedTypes: SensitiveDataType[];
  maskedCount: number;
}

function validateExtractedText(value: string): string {
  const text = value.trim();
  if (
    text.length === 0 ||
    !hasValidUnicode(text) ||
    countVisibleCharacters(text) > MAX_TEXT_VISIBLE_CHARACTERS
  ) {
    throw new ResumeProcessingError(
      "EXTRACTED_TEXT_INVALID",
      "Extracted resume text is empty, invalid, or too long.",
    );
  }
  return text;
}

export class ResumeParsePipeline {
  constructor(private readonly dependencies: ResumeParsePipelineDependencies) {}

  async extract(source: ResumeParseSource, signal?: AbortSignal): Promise<string> {
    if (source.inputType === "text") {
      return validateExtractedText(source.sourceText ?? "");
    }
    if (source.inputType === "images") {
      const pages = await Promise.all(
        source.temporaryFileIds.map(async (fileId) =>
          (await this.dependencies.ocr.recognize(source.userId, fileId, signal)).text,
        ),
      );
      return validateExtractedText(pages.join("\n\n"));
    }

    const fileId = source.temporaryFileIds[0];
    if (fileId === undefined || source.temporaryFileIds.length !== 1) {
      throw new ResumeProcessingError(
        "INVALID_DOCUMENT",
        "The resume source file is missing.",
      );
    }
    const file = await this.dependencies.files.readValidatedFile(
      source.userId,
      fileId,
      source.inputType,
    );
    if (file === null) {
      throw new ResumeProcessingError(
        "INVALID_DOCUMENT",
        "The resume source file is missing.",
      );
    }
    if (source.inputType === "docx") {
      return validateExtractedText(await this.dependencies.docx.extract(file.bytes));
    }
    const extracted = await this.dependencies.pdf.extract(file.bytes);
    return validateExtractedText(extracted.text);
  }

  async parseExtracted(
    extractedText: string,
    resumeId: string,
  ): Promise<ParsedResumeResult> {
    const privacy = new ResumePrivacyGateway({
      parseResumeText: (maskedText) =>
        this.dependencies.parser.parse(maskedText, resumeId),
    });
    const result = await privacy.parseResumeText(
      validateExtractedText(extractedText),
    );
    return {
      profile: result.value,
      maskedTypes: result.maskedTypes,
      maskedCount: result.maskedCount,
    };
  }
}
