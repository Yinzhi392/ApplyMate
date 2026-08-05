import { describe, expect, it } from "vitest";

import {
  FACT_SOURCE_TYPES,
  createFactId,
  hashFactText,
} from "../../shared/src/index.js";

describe("stable fact identity", () => {
  it("defines all approved resume and preference source types", () => {
    expect(FACT_SOURCE_TYPES).toEqual([
      "education",
      "experience",
      "project",
      "skill",
      "language",
      "certificate",
      "achievement",
      "preference",
      "other",
    ]);
  });

  it("returns the same ID and hash for equivalent normalized text", () => {
    expect(createFactId("project", "  数据分析\n项目 ")).toBe(
      createFactId("project", "数据分析 项目"),
    );
    expect(hashFactText("e\u0301  项目")).toBe(hashFactText("é 项目"));
  });

  it("changes the ID when text or source changes", () => {
    const original = createFactId("project", "数据分析项目");

    expect(createFactId("project", "风控分析项目")).not.toBe(original);
    expect(createFactId("experience", "数据分析项目")).not.toBe(original);
  });

  it("does not collide across a representative sample", () => {
    const ids = Array.from({ length: 200 }, (_, index) =>
      createFactId("skill", `合成技能 ${index}`),
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^fact_[a-f0-9]{24}$/u.test(id))).toBe(true);
  });
});
