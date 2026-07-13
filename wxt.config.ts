import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "output",
  modules: ["@wxt-dev/module-vue"],
  manifestVersion: 3,
  manifest: {
    name: "LingoFrame",
    description: "Select a region. Translate what matters.",
    minimum_chrome_version: "102",
    permissions: ["activeTab", "scripting", "storage"],
    optional_host_permissions: [
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
      "http://[::1]/*",
    ],
    action: {
      default_title: "Select a region to translate",
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
        description: "Select a region to translate",
      },
    },
  },
  hooks: {
    "build:manifestGenerated": (wxt, manifest) => {
      if (wxt.config.mode === "e2e") {
        manifest.host_permissions = ["http://127.0.0.1/*"];
      } else {
        delete manifest.host_permissions;
      }
    },
  },
});
