import { createFactId, hashFactText, normalizeFactText } from "./facts.js";
import { MAX_PREFERENCE_VISIBLE_CHARACTERS } from "./limits.js";
import { countVisibleCharacters } from "./text.js";

export interface PreferenceFact {
  factId: string;
  sourceType: "preference";
  text: string;
  factHash: string;
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
