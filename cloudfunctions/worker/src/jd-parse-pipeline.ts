import {
  MAX_TEXT_VISIBLE_CHARACTERS,
  countVisibleCharacters,
  hasValidUnicode,
  maskSensitiveText,
  type JobDescription,
  type SensitiveDataType,
} from "../../../shared/src/index.js";

import { GenerationProcessingError } from "./generation-processing-error.js";
import type { JdStructureParser } from "./jd-structure-parser.js";
import type { TencentOcrAdapter } from "./tencent-ocr-adapter.js";

export interface JdParseSource {
  userId: string;
  inputType: "text" | "images";
  temporaryFileIds: string[];
  sourceText?: string;
}

export interface JdParsePipelineDependencies {
  ocr: Pick<TencentOcrAdapter, "recognize">;
  parser: JdStructureParser;
}

export interface ParsedJdResult {
  maskedText: string;
  jobDescription: JobDescription;
  maskedTypes: SensitiveDataType[];
  maskedCount: number;
}

function validateExtractedJd(value: string): string {
  const text = value.trim();
  if (
    text.length === 0 ||
    !hasValidUnicode(text) ||
    countVisibleCharacters(text) > MAX_TEXT_VISIBLE_CHARACTERS
  ) {
    throw new GenerationProcessingError(
      "JD_TEXT_INVALID",
      "Extracted JD text is empty, invalid, or too long.",
    );
  }
  return text;
}

export class JdParsePipeline {
  constructor(private readonly dependencies: JdParsePipelineDependencies) {}

  async extract(source: JdParseSource, signal?: AbortSignal): Promise<string> {
    if (source.inputType === "text") {
      return validateExtractedJd(source.sourceText ?? "");
    }
    const pages: string[] = [];
    for (const fileId of source.temporaryFileIds) {
      const result = await this.dependencies.ocr.recognize(
        source.userId,
        fileId,
        signal,
      );
      pages.push(result.text);
    }
    return validateExtractedJd(pages.join("\n\n"));
  }

  async parse(extractedText: string): Promise<ParsedJdResult> {
    const masked = maskSensitiveText(validateExtractedJd(extractedText));
    return {
      maskedText: masked.text,
      jobDescription: await this.dependencies.parser.parse(masked.text),
      maskedTypes: Array.from(new Set(masked.matches.map(({ type }) => type))),
      maskedCount: masked.matches.length,
    };
  }
}

