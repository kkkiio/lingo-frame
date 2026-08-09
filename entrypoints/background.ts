import { browser } from "wxt/browser";
import {
  TRANSLATION_SESSION_PORT,
  type RuntimeMessage,
  type TranslationResponse,
  type TranslationSessionCommand,
  type TranslationSessionEvent,
} from "../src/shared/messages";
import {
  getActiveProviderSettings,
  readSettings,
  settingsSchema,
} from "../src/shared/settings";
import { ProviderTranslationSession } from "../src/translation/provider";

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
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === TRANSLATION_SESSION_PORT) {
      handleTranslationPort(port);
    }
  });
});

async function handleRuntimeMessage(
  message: RuntimeMessage,
): Promise<TranslationResponse | { ok: true }> {
  if (message.type === "TEST_PROVIDER") {
    const settings = settingsSchema.parse(message.settings);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const session = new ProviderTranslationSession(settings);
      await session.translateChunk([{
        id: "connection-test:segment-0",
        unitId: "connection-test",
        role: "paragraph",
        text: "Hello",
      }], controller.signal);
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

  return { ok: false, error: "Unknown LingoFrame message" };
}

function handleTranslationPort(
  port: ReturnType<typeof browser.runtime.connect>,
): void {
  let currentController: AbortController | null = null;
  let activeSessionId: string | null = null;
  let cancelled = false;
  let disconnected = false;
  let started = false;

  port.onDisconnect.addListener(() => {
    disconnected = true;
    cancelled = true;
    currentController?.abort();
    currentController = null;
  });

  port.onMessage.addListener((message: unknown) => {
    const command = message as TranslationSessionCommand;
    if (
      command.type === "CANCEL_TRANSLATION_SESSION" &&
      command.sessionId === activeSessionId
    ) {
      cancelled = true;
      currentController?.abort();
      currentController = null;
      return;
    }
    if (command.type !== "START_TRANSLATION_SESSION" || started) {
      return;
    }

    started = true;
    activeSessionId = command.sessionId;
    void (async () => {
      try {
        const segments = command.chunks.flatMap((chunk) => chunk.segments);
        const segmentIds = new Set(segments.map(({ id }) => id));
        if (
          !command.sessionId.trim() ||
          command.chunks.length === 0 ||
          command.chunks.some((chunk) => !chunk.id.trim() || chunk.segments.length === 0) ||
          segments.length !== segmentIds.size
        ) {
          throw new Error("Translation Session contains invalid chunks");
        }

        const settings = await readSettings();
        const providerSession = new ProviderTranslationSession(settings);
        for (const chunk of command.chunks) {
          if (cancelled || disconnected) {
            return;
          }

          const controller = new AbortController();
          currentController = controller;
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, 45_000);
          try {
            const translations = await providerSession.translateChunk(
              chunk.segments,
              controller.signal,
            );
            if (cancelled || disconnected) {
              return;
            }
            const event: TranslationSessionEvent = {
              type: "TRANSLATION_CHUNK_COMPLETED",
              sessionId: command.sessionId,
              chunkId: chunk.id,
              translations,
            };
            port.postMessage(event);
          } catch (error) {
            if (timedOut) {
              throw new Error("Translation request timed out");
            }
            throw error;
          } finally {
            clearTimeout(timer);
            if (currentController === controller) {
              currentController = null;
            }
          }
        }

        if (!cancelled && !disconnected) {
          const event: TranslationSessionEvent = {
            type: "TRANSLATION_SESSION_COMPLETED",
            sessionId: command.sessionId,
          };
          port.postMessage(event);
        }
      } catch (error) {
        if (!cancelled && !disconnected) {
          const event: TranslationSessionEvent = {
            type: "TRANSLATION_SESSION_FAILED",
            sessionId: command.sessionId,
            error: error instanceof Error ? error.message : "Translation failed",
          };
          port.postMessage(event);
        }
      }
    })();
  });
}
