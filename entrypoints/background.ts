import { browser } from "wxt/browser";
import type { RuntimeMessage, TranslationResponse } from "../src/shared/messages";
import {
  getActiveProviderSettings,
  readSettings,
  settingsSchema,
} from "../src/shared/settings";
import { translateRegionWithProvider } from "../src/translation/provider";

const activeRequests = new Map<string, AbortController>();

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) {
      return;
    }

    try {
      const settings = await readSettings();
      if (!getActiveProviderSettings(settings).apiKey.trim()) {
        await browser.runtime.openOptionsPage();
        return;
      }

      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["/content-scripts/content.js"],
      });
      await browser.action.setBadgeText({ tabId: tab.id, text: "" });
      await browser.action.setTitle({
        tabId: tab.id,
        title: "Select a region to translate",
      });
    } catch (error) {
      console.warn("LingoFrame cannot run on this page", error);
      await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#dc2626" });
      await browser.action.setBadgeText({ tabId: tab.id, text: "!" });
      await browser.action.setTitle({
        tabId: tab.id,
        title: "LingoFrame cannot access this page",
      });
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    return handleRuntimeMessage(message as RuntimeMessage);
  });
});

async function handleRuntimeMessage(
  message: RuntimeMessage,
): Promise<TranslationResponse | { ok: true }> {
  if (message.type === "CANCEL_TRANSLATION") {
    activeRequests.get(message.requestId)?.abort();
    activeRequests.delete(message.requestId);
    return { ok: true };
  }

  if (message.type === "TEST_PROVIDER") {
    const settings = settingsSchema.parse(message.settings);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      await translateRegionWithProvider(
        [{ id: "connection-test", role: "paragraph", text: "Hello" }],
        settings,
        controller.signal,
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: controller.signal.aborted
          ? "Provider test timed out"
          : error instanceof Error ? error.message : "Provider test failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  if (message.type === "TRANSLATE_REGION") {
    const settings = await readSettings();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    activeRequests.set(message.requestId, controller);

    try {
      const translations = await translateRegionWithProvider(
        message.units,
        settings,
        controller.signal,
      );
      return { ok: true, translations };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Translation failed";
      return {
        ok: false,
        error: controller.signal.aborted ? "Translation was cancelled or timed out" : reason,
      };
    } finally {
      clearTimeout(timer);
      activeRequests.delete(message.requestId);
    }
  }

  return { ok: false, error: "Unknown LingoFrame message" };
}
