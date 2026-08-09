export interface LoginLayoutMetrics {
  menuBottom: number;
  menuTop: number;
  statusBarHeight: number;
  windowWidth: number;
}

export interface LoginLayout {
  contentTopPx: number;
  headingTopPx: number;
}

const BRAND_AND_TITLE_GAP_RPX = 100;
const CAPSULE_CLEARANCE_PX = 16;
const STATUS_BAR_CLEARANCE_PX = 8;
const FALLBACK_HEADING_OFFSET_PX = 52;

function nonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function calculateLoginLayout(metrics: LoginLayoutMetrics): LoginLayout {
  const statusBarHeight = nonNegative(metrics.statusBarHeight, 20);
  const windowWidth = Math.max(320, nonNegative(metrics.windowWidth, 375));
  const menuTop = nonNegative(metrics.menuTop, 0);
  const menuBottom = nonNegative(metrics.menuBottom, 0);
  const hasValidCapsule = menuBottom > menuTop && menuTop >= statusBarHeight;
  const headingOffsetPx = BRAND_AND_TITLE_GAP_RPX * windowWidth / 750;
  const requiredHeadingTopPx = hasValidCapsule
    ? menuBottom + CAPSULE_CLEARANCE_PX
    : statusBarHeight + FALLBACK_HEADING_OFFSET_PX;
  const contentTopPx = Math.ceil(Math.max(
    statusBarHeight + STATUS_BAR_CLEARANCE_PX,
    requiredHeadingTopPx - headingOffsetPx,
  ));

  return {
    contentTopPx,
    headingTopPx: contentTopPx + headingOffsetPx,
  };
}
