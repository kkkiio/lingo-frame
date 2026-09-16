import { defineConfig } from "wxt";
import { lingui } from "@lingui/vite-plugin";
import { readFileSync } from "node:fs";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  outDir: "output",
  modules: ["@wxt-dev/module-vue"],
  manifestVersion: 3,
  vite: () => ({ plugins: [lingui()] }),
  manifest: {
    name: "LingoFrame",
    description: "__MSG_extensionDescription__",
    default_locale: "zh_CN",
    minimum_chrome_version: "102",
    permissions: ["activeTab", "scripting", "storage"],
    optional_host_permissions: [
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://[::1]/*",
    ],
    action: {
      default_title: "__MSG_actionTitle__",
      default_icon: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
      },
    },
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Alt+Shift+L",
          mac: "Alt+Shift+L",
        },
        description: "__MSG_actionTitle__",
      },
    },
  },
  hooks: {
    "build:publicAssets": async (_wxt, assets) => {
      for (const [locale, chromeLocale] of [
        ["en", "en"],
        ["zh-CN", "zh_CN"],
      ]) {
        const catalog = await formatter().parse(
          readFileSync(`src/locales/${locale}/messages.po`, "utf8"),
          { locale: locale!, sourceLocale: "en", filename: `src/locales/${locale}/messages.po` },
        );
        const messages = Object.fromEntries(
          ["extensionDescription", "actionTitle"].map((id) => [
            id,
            { message: catalog[id]!.translation },
          ]),
        );
        assets.push({
          relativeDest: `_locales/${chromeLocale}/messages.json`,
          contents: JSON.stringify(messages),
        });
      }
    },
    "build:manifestGenerated": (wxt, manifest) => {
      if (wxt.config.mode === "e2e") {
        manifest.host_permissions = ["http://127.0.0.1/*"];
      } else {
        delete manifest.host_permissions;
      }
    },
  },
});
