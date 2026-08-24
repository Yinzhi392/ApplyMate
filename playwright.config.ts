import { defineConfig } from "@playwright/test";

const e2ePort = Number(process.env.APPLYMATE_E2E_PORT ?? "4173");
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: true,
  outputDir: "/private/tmp/applymate-playwright-results",
  retries: 0,
  reporter: "line",
  use: {
    baseURL: e2eBaseUrl,
    browserName: "chromium",
    channel: "chrome",
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `VITE_E2E_MODE=true npm run web:dev -- --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
