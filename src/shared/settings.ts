import { browser } from "wxt/browser";
import { z } from "zod";
import { TARGET_LANGUAGES } from "./languages";

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

export const targetLanguageSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const language = TARGET_LANGUAGES.find(({ english }) => english === value.trim());
    return language ? { kind: "preset", code: language.code } : { kind: "custom", name: value };
  },
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("preset"), code: z.enum(TARGET_LANGUAGES.map(({ code }) => code)) }),
    z.object({ kind: z.literal("custom"), name: z.string().trim().min(1) }),
  ]),
);

export const translationInstructionsSchema = z.preprocess(
  (value) => {
    if (value == null) return { mode: "default", customText: "" };
    if (typeof value === "string") return { mode: "custom", customText: value };
    return value;
  },
  z
    .object({
      mode: z.enum(["default", "custom"]),
      customText: z.string(),
    })
    .refine(({ mode, customText }) => mode === "default" || customText.trim().length > 0, {
      path: ["customText"],
      message: "Enter translation instructions",
    }),
);

export const settingsSchema = z.object({
  provider: providerIdSchema,
  targetLanguage: targetLanguageSchema,
  translationInstructions: translationInstructionsSchema,
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
  targetLanguage: { kind: "preset", code: "zh-Hans" },
  translationInstructions: { mode: "default", customText: "" },
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
    if (JSON.stringify(stored[SETTINGS_KEY]) !== JSON.stringify(parsed.data)) {
      await browser.storage.local.set({ [SETTINGS_KEY]: parsed.data });
    }
    return parsed.data;
  }

  if (stored[SETTINGS_KEY] !== undefined) {
    throw new Error("Stored settings could not be read");
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
