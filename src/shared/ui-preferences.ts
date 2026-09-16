import { browser } from "wxt/browser";
import { z } from "zod";

export const uiPreferenceSchema = z.enum(["auto", "en", "zh-CN"]);
export const uiLocaleSchema = z.enum(["en", "zh-CN"]);
export type UiPreference = z.infer<typeof uiPreferenceSchema>;
export type UiLocale = z.infer<typeof uiLocaleSchema>;
export const UI_LOCALE_PORT = "LINGO_FRAME_UI_LOCALE";

export async function readUiPreferences(): Promise<{ preference: UiPreference; locale: UiLocale }> {
  const stored = await browser.storage.local.get("uiPreferences");
  const parsed = uiPreferenceSchema.safeParse(
    (stored.uiPreferences as { locale?: unknown } | undefined)?.locale,
  );
  const preference = parsed.success ? parsed.data : "auto";
  const browserLanguage = browser.i18n.getUILanguage();
  const detectedLocale: UiLocale = /^zh(?:-|_|$)/i.test(browserLanguage) ? "zh-CN" : "en";
  const locale = preference === "auto" ? detectedLocale : preference;
  return { preference, locale };
}
