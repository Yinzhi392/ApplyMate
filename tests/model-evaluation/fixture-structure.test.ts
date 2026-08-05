import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fixturePath = join(process.cwd(), "tests", "fixtures", "phase-0-cases.md");
const fixtureContent = readFileSync(fixturePath, "utf8");

describe("phase-0 fixture draft", () => {
  it("contains exactly 30 sequential cases", () => {
    const caseIds = [...fixtureContent.matchAll(/^## (C\d{2})｜/gmu)].map((match) => match[1]);
    const expectedIds = Array.from({ length: 30 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);

    expect(caseIds).toEqual(expectedIds);
  });

  it("contains every required section for every case", () => {
    const requiredMarkers = [
      "确认状态",
      "输入形式与覆盖",
      "简历输入",
      "JD 输入",
      "关键字段真值",
      "允许事实",
      "禁止事实",
      "预期流程/警告",
    ];

    for (const marker of requiredMarkers) {
      const matches = fixtureContent.match(new RegExp(`^- \\*\\*${marker}：\\*\\*`, "gmu"));
      expect(matches, marker).toHaveLength(30);
    }
  });

  it("contains all six critical ground-truth fields per case", () => {
    const truthFields = ["岗位名=", "职责=", "硬技能=", "经验教育=", "地点方式=", "到岗时长="];

    for (const field of truthFields) {
      expect(fixtureContent.split(field)).toHaveLength(31);
    }
  });
});

