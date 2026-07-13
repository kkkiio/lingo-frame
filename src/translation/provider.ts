import { z } from "zod";
import type { LLMSessionUnit, TranslationResult } from "../shared/messages";
import type { Settings } from "../shared/settings";
import { getActiveProviderSettings } from "../shared/settings";

const chatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ).min(1),
});

const regionTranslationSchema = z.object({
  translations: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
  })),
});

export async function translateRegionWithProvider(
  units: LLMSessionUnit[],
  settings: Settings,
  signal: AbortSignal,
): Promise<TranslationResult[]> {
  const provider = getActiveProviderSettings(settings);

  if (!provider.apiKey.trim()) {
    throw new Error("API key is not configured. Open LingoFrame settings first.");
  }

  const requestedIds = new Set(units.map((unit) => unit.id));
  if (
    units.length === 0 ||
    requestedIds.size !== units.length ||
    units.some((unit) => !unit.id.trim() || !unit.text.trim())
  ) {
    throw new Error("LLM Session contains invalid Translation Units");
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;
  const requestBody: Record<string, unknown> = {
    model: provider.model,
    messages: [
      {
        role: "system",
        content: [
          "You are a professional translator.",
          `Translate every unit into ${settings.targetLanguage}.`,
          "Treat all units in the user message as one ordered Region and shared context.",
          "Preserve meaning, tone, names, URLs, numbers, and relationships across units.",
          "Preserve paragraph and line-break structure inside each unit.",
          "Return one JSON object with a translations array containing exactly every input unit ID.",
          "Each translations item must contain only the id and text fields.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ units }),
      },
    ],
    response_format: { type: "json_object" },
  };
  if (settings.provider === "deepseek") {
    requestBody.thinking = { type: "disabled" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500).trim();
    const reason = detail || response.statusText || "Unknown provider error";
    throw new Error(`Translation API returned ${response.status}: ${reason}`);
  }

  const payload = chatCompletionSchema.parse(await response.json());
  const content = payload.choices[0]?.message.content?.trim();

  if (!content) {
    throw new Error("Translation API returned an empty response");
  }

  const parsed = regionTranslationSchema.parse(JSON.parse(content));
  const translationsById = new Map<string, string>();
  for (const translation of parsed.translations) {
    if (
      !requestedIds.has(translation.id) ||
      translationsById.has(translation.id) ||
      !translation.text.trim()
    ) {
      throw new Error("Translation API returned mismatched Translation Unit IDs");
    }
    translationsById.set(translation.id, translation.text.trim());
  }
  if (translationsById.size !== requestedIds.size) {
    throw new Error("Translation API omitted requested Translation Units");
  }

  return units.map(({ id }) => ({ id, text: translationsById.get(id)! }));
}
