export const TAB_ROUTES = [
  { pagePath: "pages/home/index", text: "首页" },
  { pagePath: "pages/records/index", text: "记录" },
  { pagePath: "pages/mine/index", text: "我的" },
] as const;

export const FLOW_ROUTES = [
  "pages/login/index",
  "pages/resumes/index",
  "pages/resume-upload/index",
  "pages/resume-edit/index",
  "pages/preferences/index",
  "pages/generation/index",
  "pages/job/index",
  "pages/result/index",
  "pages/application-detail/index",
  "pages/admin/index",
] as const;

export const PAGE_ROUTES = [
  "pages/login/index",
  ...TAB_ROUTES.map(({ pagePath }) => pagePath),
  ...FLOW_ROUTES.filter((route) => route !== "pages/login/index"),
] as const;

const TAB_ROUTE_SET = new Set<string>(TAB_ROUTES.map(({ pagePath }) => pagePath));

export function isTabRoute(route: string): boolean {
  return TAB_ROUTE_SET.has(route);
}
