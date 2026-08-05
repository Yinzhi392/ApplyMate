export const MAX_IMAGE_COUNT = 6;
export const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
export const MAX_TEXT_VISIBLE_CHARACTERS = 20_000;
export const MAX_PREFERENCE_VISIBLE_CHARACTERS = 500;
export const MAX_FEEDBACK_VISIBLE_CHARACTERS = 500;
export const MAX_RESUME_COUNT = 3;
export const MAX_FACT_TEXT_VISIBLE_CHARACTERS = 2_000;
export const MIN_GREETING_VISIBLE_CHARACTERS = 250;
export const MAX_GREETING_VISIBLE_CHARACTERS = 350;
export const MIN_GREETING_PARAGRAPHS = 2;
export const MAX_GREETING_PARAGRAPHS = 3;

export function isWithinInclusiveLimit(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}
