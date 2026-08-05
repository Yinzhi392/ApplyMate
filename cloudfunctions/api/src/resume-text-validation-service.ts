import {
  MAX_TEXT_VISIBLE_CHARACTERS,
  countVisibleCharacters,
  hasValidUnicode,
} from "../../../shared/src/index.js";

import { DomainError } from "./domain-error.js";

export class ResumeTextValidationService {
  validate(value: string): string {
    const text = value.trim();
    if (
      text.length === 0 ||
      !hasValidUnicode(text) ||
      countVisibleCharacters(text) > MAX_TEXT_VISIBLE_CHARACTERS
    ) {
      throw new DomainError("INVALID_REQUEST", "Resume text is invalid.");
    }
    return text;
  }
}
