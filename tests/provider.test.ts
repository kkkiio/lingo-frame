import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationSegment } from "../src/shared/messages";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";
import { ProviderTranslationSession } from "../src/translation/provider";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProviderTranslationSession", () => {
  it("calls an OpenAI-compatible endpoint with the selected target language", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.provider = "openai-compatible";
    settings.targetLanguage = "Japanese";
    settings.providers["openai-compatible"] = {
      apiKey: "test-key",
      baseUrl: "https://translator.example/v1/",
      model: "example-model",
    };
    const segment: TranslationSegment = {
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "paragraph",
      text: "Original text",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: ["翻訳結果"],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const session = new ProviderTranslationSession(settings);
    const result = await session.translateChunk([segment], new AbortController().signal);

    expect(result).toEqual([{ id: segment.id, text: "翻訳結果" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://translator.example/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchSnapshot();
    expect(body.model).toBe("example-model");
    expect(body.thinking).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("Japanese");
    expect(body.messages[0].content).toContain("latest user message");
    expect(body.messages[0].content).toContain("Earlier user and assistant messages");
    expect(body.messages[0].content).toContain("accurate, idiomatic translation");
    expect(body.messages[0].content).toContain("Keep proper names in their original form");
    expect(body.messages[0].content.indexOf("<translation_instructions>"))
      .toBeLessThan(body.messages[0].content.indexOf("Return one JSON object"));
    expect(JSON.parse(body.messages[1].content)).toEqual({
      segments: [{ role: segment.role, text: segment.text }],
    });
  });

  it("replaces translation preferences without replacing the response contract", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.translationInstructions = "Use concise language for domain experts.";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: ["Translated"],
      }) } }],
    }), { status: 200 }));

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk([{
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "text",
      text: "Original",
    }], new AbortController().signal);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchSnapshot();
    const systemPrompt = body.messages[0].content as string;
    expect(systemPrompt).toContain("Use concise language for domain experts.");
    expect(systemPrompt).not.toContain("Attention in a Transformer context");
    expect(systemPrompt).toContain("Translation Segment in the latest user message");
    expect(systemPrompt).toContain("Do not omit, merge, duplicate, reorder, or invent Translation Segments.");
  });

  it("accepts a complete endpoint URL and disables DeepSeek thinking", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.providers.deepseek.baseUrl = "https://api.example/chat/completions";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: ["Translated"],
      }) } }],
    }), { status: 200 }));

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk([{
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "text",
      text: "Original",
    }], new AbortController().signal);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchSnapshot();
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("rejects missing credentials before making a request", () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => new ProviderTranslationSession(settings)).toThrow("API key is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider, response shape, and translation count failures", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    const segment: TranslationSegment = {
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "text",
      text: "Original",
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429,
        statusText: "Too Many Requests",
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          translations: ["Translated", "Unexpected extra translation"],
        }) } }],
      }), { status: 200 }));

    await expect(new ProviderTranslationSession(settings).translateChunk(
      [segment],
      new AbortController().signal,
    )).rejects.toThrow("429");
    await expect(new ProviderTranslationSession(settings).translateChunk(
      [segment],
      new AbortController().signal,
    )).rejects.toThrow();
    await expect(new ProviderTranslationSession(settings).translateChunk(
      [segment],
      new AbortController().signal,
    )).rejects.toThrow("wrong number of translations");
  });

  it("appends each successful chunk to one multi-turn context", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    const first: TranslationSegment = {
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "heading",
      text: "Heading",
    };
    const second: TranslationSegment = {
      id: "unit-1:segment-0",
      unitId: "unit-1",
      role: "paragraph",
      text: "Next section",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const request = JSON.parse(body.messages.at(-1).content);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          translations: request.segments.map((segment: { text: string }) => (
            `translated-${segment.text}`
          )),
        }) } }],
      }), { status: 200 });
    });

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk([first], new AbortController().signal);
    const result = await session.translateChunk([second], new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.messages.map(({ role }: { role: string }) => role))
      .toEqual(["system", "user"]);
    expect(secondBody.messages.map(({ role }: { role: string }) => role))
      .toEqual(["system", "user", "assistant", "user"]);
    expect(JSON.parse(secondBody.messages[1].content)).toEqual({
      segments: [{ role: first.role, text: first.text }],
    });
    expect(JSON.parse(secondBody.messages[2].content)).toEqual({
      translations: [`translated-${first.text}`],
    });
    expect(JSON.parse(secondBody.messages[3].content)).toEqual({
      segments: [{ role: second.role, text: second.text }],
    });
    expect(result).toEqual([{ id: second.id, text: `translated-${second.text}` }]);
  });
});
