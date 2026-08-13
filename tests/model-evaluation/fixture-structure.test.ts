import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fixturePath = join(process.cwd(), "tests", "fixtures", "phase-0-cases.md");
const fixtureContent = readFileSync(fixturePath, "utf8");

const lockedVersion = "phase0-v1.0";
const lockedAt = "2026-08-11T11:59:00+08:00";

describe("phase-0 locked fixtures", () => {
  it("contains exactly 30 sequential cases", () => {
    const caseIds = [...fixtureContent.matchAll(/^## (C\d{2})｜/gmu)].map((match) => match[1]);
    const expectedIds = Array.from({ length: 30 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);

    expect(caseIds).toEqual(expectedIds);
  });

  it("contains every required section for every case", () => {
    const requiredMarkers = [
      "确认状态",
      "确认版本",
      "确认时间",
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

  it("locks every case to the same human-confirmed version and Beijing timestamp", () => {
    expect(fixtureContent).toContain(`**版本：** ${lockedVersion}`);
    expect(fixtureContent).toContain(`**人工确认时间：** ${lockedAt}`);

    const caseSections = fixtureContent.split(/^## C\d{2}｜.+$/gmu).slice(1);
    expect(caseSections).toHaveLength(30);

    for (const section of caseSections) {
      expect(section).toContain("- **确认状态：** 已确认");
      expect(section).toContain(`- **确认版本：** ${lockedVersion}`);
      expect(section).toContain(`- **确认时间：** ${lockedAt}`);
    }

    expect(fixtureContent).not.toContain("- **确认状态：** 待确认");
  });

  it("contains all six critical ground-truth fields per case", () => {
    const truthFields = ["岗位名=", "职责=", "硬技能=", "经验教育=", "地点方式=", "到岗时长="];

    for (const field of truthFields) {
      expect(fixtureContent.split(field)).toHaveLength(31);
    }
  });
});
