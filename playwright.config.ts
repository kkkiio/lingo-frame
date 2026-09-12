import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  outputDir: "test-results/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    trace: "retain-on-failure",
  },
});
