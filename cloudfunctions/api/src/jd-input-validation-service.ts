import {
  MAX_TEXT_VISIBLE_CHARACTERS,
  countVisibleCharacters,
  hasValidUnicode,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";
import type { ValidatedJdInput } from "./generation-domain.js";
import type { ResumeFileValidationService } from "./resume-file-validation-service.js";
import type { TemporaryFileService } from "./temporary-file-service.js";

export type JdInput =
  | { inputType: "text"; text: string }
  | { inputType: "images"; fileIds: string[] };

export class JdInputValidationService {
  constructor(
    private readonly temporaryFiles: TemporaryFileService,
    private readonly fileValidation: ResumeFileValidationService,
  ) {}

  async validate(userId: string, input: JdInput): Promise<ValidatedJdInput> {
    if (input.inputType === "text") {
      const sourceText = input.text.trim();
      if (
        sourceText.length === 0 ||
        !hasValidUnicode(sourceText) ||
        countVisibleCharacters(sourceText) > MAX_TEXT_VISIBLE_CHARACTERS
      ) {
        throw new DomainError("INVALID_REQUEST", "JD text is invalid.");
      }
      return { inputType: "text", sourceText };
    }

    const files = await Promise.all(
      input.fileIds.map((fileId) =>
        this.temporaryFiles.getOwnedFile(userId, fileId),
      ),
    );
    this.fileValidation.validate("images", files);
    return { inputType: "images", fileIds: [...input.fileIds] };
  }
}

