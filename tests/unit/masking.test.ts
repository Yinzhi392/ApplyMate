import { describe, expect, it } from "vitest";

import { maskSensitiveText } from "../../shared/src/index.js";

describe("sensitive text masking", () => {
  it("masks supported contact and identity values with punctuation nearby", () => {
    const originals = [
      "138-0013-8000",
      "Test.User+job@Example.COM",
      "11010519900101123X",
      "E12345678",
      "北京市海淀区中关村大街27号3栋",
    ];
    const input = `电话（${originals[0]}），邮箱:${originals[1]}；身份证 ${originals[2]}，护照 ${originals[3]}，住址：${originals[4]}。`;

    const result = maskSensitiveText(input);

    expect(result.matches.map(({ type }) => type)).toEqual([
      "phone",
      "email",
      "nationalId",
      "documentNumber",
      "detailedAddress",
    ]);
    for (const original of originals) {
      expect(result.text).not.toContain(original);
    }
    expect(result.matches.every(({ start, end }) => start >= 0 && end > start)).toBe(
      true,
    );
  });

  it("recognizes phone separators and case-insensitive passport prefixes", () => {
    const result = maskSensitiveText("+86 139 1234 5678 / p1234567");

    expect(result.matches.map(({ type }) => type)).toEqual([
      "phone",
      "documentNumber",
    ]);
    expect(result.text).not.toContain("139 1234 5678");
    expect(result.text).not.toContain("p1234567");
  });

  it("avoids common numeric and location false positives", () => {
    const input =
      "项目周期为2024-08-05至2024-12-31，团队138人，工作地点北京市海淀区，批次 E12345678B。";

    expect(maskSensitiveText(input)).toEqual({ text: input, matches: [] });
  });
});
