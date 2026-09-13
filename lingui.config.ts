import { defineConfig } from "@lingui/cli";
import { createVueExtractor } from "@lingui/extractor-vue";
import babel from "@lingui/cli/api/extractors/babel";

export default defineConfig({
  locales: ["en", "zh-CN"],
  sourceLocale: "en",
  fallbackLocales: { default: "en" },
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src", "<rootDir>/entrypoints"],
    },
  ],
  extractors: [babel, createVueExtractor()],
});
