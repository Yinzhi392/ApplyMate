import { createFactId, hashFactText, normalizeFactText } from "./facts.js";
import { MAX_PREFERENCE_VISIBLE_CHARACTERS } from "./limits.js";
import { countVisibleCharacters } from "./text.js";

export interface PreferenceFact {
  factId: string;
  sourceType: "preference";
  text: string;
  factHash: string;
}

export function isEducationHighlightPreferenceText(value: string): boolean {
  const normalized = normalizeFactText(value);
  return /(?:教育背景|教育经历|学校|院校|专业|成绩).{0,12}(?:是|作为|属于|算作)?(?:我的)?(?:求职)?优势/u.test(normalized) ||
    /(?:突出|强调|重点写|优先写|展示).{0,12}(?:教育背景|教育经历|学校|院校|专业|成绩)/u.test(normalized);
}

export function createPreferenceFacts(value: string): PreferenceFact[] {
  if (countVisibleCharacters(value) > MAX_PREFERENCE_VISIBLE_CHARACTERS) {
    throw new RangeError("Preference text exceeds 500 visible characters.");
  }

  const uniquePreferences = new Set(
    value
      .split(/[\r\n]+|[。！？；;.!?]+/u)
      .map(normalizeFactText)
      .filter((preference) => preference.length > 0),
  );

  return Array.from(uniquePreferences, (text) => ({
    factId: createFactId("preference", text),
    sourceType: "preference",
    text,
    factHash: hashFactText(text),
  }));
}
