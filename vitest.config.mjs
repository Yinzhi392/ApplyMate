import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [
      "tests/unit/miniprogram-*.test.ts",
      "tests/unit/cloud-storage-performance.test.ts",
      "tests/integration/miniprogram-*.test.ts",
      "tests/integration/phase-9-visual-preview.test.ts",
    ],
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 10_000,
  },
});
