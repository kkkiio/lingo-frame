import { browser } from "wxt/browser";
import { z } from "zod";

export const providerIdSchema = z.enum(["deepseek", "openai-compatible"]);

export const providerSettingsSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  }, "API endpoint must use HTTPS, except for loopback HTTP"),
  model: z.string().min(1),
});

export const settingsSchema = z.object({
  provider: providerIdSchema,
  targetLanguage: z.string().min(1),
  translationInstructions: z.string().trim().min(1).nullable().default(null),
  providers: z.object({
    deepseek: providerSettingsSchema,
    "openai-compatible": providerSettingsSchema,
  }),
});

export type ProviderId = z.infer<typeof providerIdSchema>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: "deepseek",
  targetLanguage: "Simplified Chinese",
  translationInstructions: null,
  providers: {
    deepseek: {
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    },
    "openai-compatible": {
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
    },
  },
};

const SETTINGS_KEY = "settings";

export async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const parsed = settingsSchema.safeParse(stored[SETTINGS_KEY]);

  if (parsed.success) {
    return parsed.data;
  }

  await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  return structuredClone(DEFAULT_SETTINGS);
}

export async function writeSettings(settings: Settings): Promise<void> {
  const parsed = settingsSchema.parse(settings);
  await browser.storage.local.set({ [SETTINGS_KEY]: parsed });
}

export function getActiveProviderSettings(settings: Settings): ProviderSettings {
  return settings.providers[settings.provider];
}

export function getEndpointPermission(baseUrl: string): string {
  const url = new URL(providerSettingsSchema.shape.baseUrl.parse(baseUrl));

  return `${url.origin}/*`;
}
