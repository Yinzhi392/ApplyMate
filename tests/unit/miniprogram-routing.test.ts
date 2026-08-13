import { describe, expect, it } from "vitest";

import {
  FLOW_ROUTES,
  PAGE_ROUTES,
  TAB_ROUTES,
  isTabRoute,
} from "../../miniprogram/core/routes.js";

describe("mini-program route manifest", () => {
  it("locks the three approved tab routes and all fourteen approved pages", () => {
    expect(TAB_ROUTES).toEqual([
      { pagePath: "pages/home/index", text: "首页" },
      { pagePath: "pages/records/index", text: "记录" },
      { pagePath: "pages/mine/index", text: "我的" },
    ]);
    expect(PAGE_ROUTES).toEqual(expect.arrayContaining([
      "pages/login/index",
      "pages/home/index",
      "pages/resumes/index",
      "pages/generation/index",
      "pages/result/index",
      "pages/legal/index",
      "pages/records/index",
      "pages/mine/index",
    ]));
    expect(FLOW_ROUTES).toContain("pages/job/index");
    expect(PAGE_ROUTES).toHaveLength(14);
    expect(FLOW_ROUTES).not.toContain("pages/jd-confirm/index");
  });

  it("distinguishes tab switching from flow navigation", () => {
    expect(isTabRoute("pages/home/index")).toBe(true);
    expect(isTabRoute("pages/result/index")).toBe(false);
  });
});
