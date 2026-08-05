const GRAPHEME_SEGMENTER = new Intl.Segmenter("zh-CN", {
  granularity: "grapheme",
});

export function countVisibleCharacters(value: string): number {
  let count = 0;

  for (const { segment } of GRAPHEME_SEGMENTER.segment(value.normalize("NFC"))) {
    if (!/^\s+$/u.test(segment)) {
      count += 1;
    }
  }

  return count;
}

export function splitNonEmptyParagraphs(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function hasValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (
        !Number.isFinite(nextCodeUnit) ||
        nextCodeUnit < 0xdc00 ||
        nextCodeUnit > 0xdfff
      ) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
}
