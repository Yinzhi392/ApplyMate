import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "compact", width: 320, height: 700 },
  { name: "standard", width: 390, height: 844 },
  { name: "wide", width: 430, height: 932 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`landing page fits ${viewport.width}px and preserves its primary touch target`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "把真实经历，写进每一次开场。" })).toBeVisible();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    const primary = page.getByRole("link", { name: "用邮箱开始" });
    const box = await primary.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await testInfo.attach(`landing-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

test("email form remains usable in a compact soft-keyboard viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const email = page.getByRole("textbox", { name: "邮箱" });
  await expect(email).toHaveAttribute("inputmode", "email");
  await email.focus();
  await email.fill("mobile@example.com");
  await page.setViewportSize({ width: 390, height: 430 });
  await email.scrollIntoViewIfNeeded();
  await expect(email).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("BrowserRouter handles direct public routes, refresh and protected-route redirect", async ({ page }) => {
  await page.goto("/legal");
  await expect(page.getByRole("heading", { name: /协议与隐私/u })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/legal$/u);

  await page.goto("/app/records");
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("textbox", { name: "邮箱" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/u);
});

test("the public Web registers no Service Worker or application manifest", async ({ page }) => {
  await page.goto("/");
  const state = await page.evaluate(async () => ({
    cacheKeys: "caches" in window ? await caches.keys() : [],
    manifestLinks: document.querySelectorAll('link[rel="manifest"]').length,
    registrations: "serviceWorker" in navigator
      ? (await navigator.serviceWorker.getRegistrations()).length
      : 0,
  }));
  expect(state).toEqual({ cacheKeys: [], manifestLinks: 0, registrations: 0 });
});
