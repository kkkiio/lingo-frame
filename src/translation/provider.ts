import { z } from "zod";
import type { TranslationResult, TranslationSegment } from "../shared/messages";
import type { Settings } from "../shared/settings";
import { getActiveProviderSettings } from "../shared/settings";
import { createTranslationSystemPrompt } from "./prompt";

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
  translations: z.array(z.string().min(1)),
});

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ProviderTranslationSession {
  private readonly endpoint: string;
  private readonly messages: ChatMessage[];
  private readonly provider: ReturnType<typeof getActiveProviderSettings>;

  constructor(private readonly settings: Settings) {
    this.provider = getActiveProviderSettings(settings);

    if (!this.provider.apiKey.trim()) {
      throw new Error("API key is not configured. Open LingoFrame settings first.");
    }

    const baseUrl = this.provider.baseUrl.replace(/\/+$/, "");
    this.endpoint = baseUrl.endsWith("/chat/completions")
      ? baseUrl
      : `${baseUrl}/chat/completions`;
    this.messages = [{
      role: "system",
      content: createTranslationSystemPrompt(settings),
    }];
  }

  async translateChunk(
    segments: TranslationSegment[],
    signal: AbortSignal,
  ): Promise<TranslationResult[]> {
    const requestedIds = new Set(segments.map((segment) => segment.id));
    if (
      segments.length === 0 ||
      requestedIds.size !== segments.length ||
      segments.some((segment) => (
        !segment.id.trim() ||
        !segment.unitId.trim() ||
        !segment.text.trim()
      ))
    ) {
      throw new Error("LLM Session contains invalid Translation Segments");
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: JSON.stringify({
        segments: segments.map(({ role, text }) => ({ role, text })),
      }),
    };
    const requestBody: Record<string, unknown> = {
      model: this.provider.model,
      messages: [...this.messages, userMessage],
      response_format: { type: "json_object" },
    };
    if (this.settings.provider === "deepseek") {
      requestBody.thinking = { type: "disabled" };
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${this.provider.apiKey}`,
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
    if (
      parsed.translations.length !== segments.length ||
      parsed.translations.some((translation) => !translation.trim())
    ) {
      throw new Error("Translation API returned the wrong number of translations");
    }

    const translations = segments.map(({ id }, index) => ({
      id,
      text: parsed.translations[index]!.trim(),
    }));
    this.messages.push(userMessage, {
      role: "assistant",
      content: JSON.stringify({
        translations: translations.map(({ text }) => text),
      }),
    });
    return translations;
  }
}
