import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 120_000,
    retry: 0,
  },
});
