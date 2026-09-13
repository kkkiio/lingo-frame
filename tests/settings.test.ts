import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, getEndpointPermission, settingsSchema } from "../src/shared/settings";

describe("settings", () => {
  it("converts a provider URL into an optional host permission", () => {
    expect(getEndpointPermission("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/*",
    );
    expect(getEndpointPermission("http://localhost:11434/v1")).toBe("http://localhost:11434/*");
    expect(getEndpointPermission("http://127.0.0.1:8000/v1")).toBe("http://127.0.0.1:8000/*");
  });

  it("rejects unsupported endpoint protocols and incomplete settings", () => {
    expect(() => getEndpointPermission("file:///tmp/provider")).toThrow("HTTPS");
    expect(() => getEndpointPermission("http://api.example.com/v1")).toThrow("HTTPS");
    expect(settingsSchema.safeParse({ provider: "deepseek" }).success).toBe(false);
  });

  it("migrates existing settings to the built-in translation instructions", () => {
    const { translationInstructions: _missing, ...storedSettings } = DEFAULT_SETTINGS;

    expect(settingsSchema.parse(storedSettings).translationInstructions).toEqual({
      mode: "default",
      customText: "",
    });
  });

  it("accepts a non-empty custom translation instruction override", () => {
    expect(
      settingsSchema.parse({
        ...DEFAULT_SETTINGS,
        translationInstructions: "  Keep Attention in English.  ",
      }).translationInstructions,
    ).toEqual({ mode: "custom", customText: "  Keep Attention in English.  " });
    expect(
      settingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        translationInstructions: "   ",
      }).success,
    ).toBe(false);
  });
});

describe("stored settings migration", () => {
  it("preserves both providers and a custom language while restoring custom instructions", () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      targetLanguage: "Scottish Gaelic",
      translationInstructions: "Use local terminology.",
      providers: {
        deepseek: { ...DEFAULT_SETTINGS.providers.deepseek, apiKey: "first-fixture-key" },
        "openai-compatible": {
          ...DEFAULT_SETTINGS.providers["openai-compatible"],
          apiKey: "second-fixture-key",
          model: "private-model",
        },
      },
    };
    const migrated = settingsSchema.parse(legacy);
    expect(migrated.targetLanguage).toEqual({ kind: "custom", name: "Scottish Gaelic" });
    expect(migrated.translationInstructions).toEqual({
      mode: "custom",
      customText: "Use local terminology.",
    });
    expect(migrated.providers).toEqual(legacy.providers);
    expect(
      settingsSchema.parse({ ...legacy, targetLanguage: "Traditional Chinese" }).targetLanguage,
    ).toEqual({ kind: "preset", code: "zh-Hant" });
  });
  it("retains an inactive instruction draft through validation", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      translationInstructions: { mode: "default", customText: "My terminology" },
    };
    expect(settingsSchema.parse(settings).translationInstructions).toEqual(
      settings.translationInstructions,
    );
  });
});
