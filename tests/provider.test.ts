import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";
import { translateRegionWithProvider } from "../src/translation/provider";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("translateRegionWithProvider", () => {
  it("calls an OpenAI-compatible endpoint with the selected target language", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.provider = "openai-compatible";
    settings.targetLanguage = "Japanese";
    settings.providers["openai-compatible"] = {
      apiKey: "test-key",
      baseUrl: "https://translator.example/v1/",
      model: "example-model",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: [{ id: "unit-0", text: "翻訳結果" }],
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await translateRegionWithProvider(
      [{ id: "unit-0", role: "paragraph", text: "Original\n\ntext" }],
      settings,
      new AbortController().signal,
    );

    expect(result).toEqual([{ id: "unit-0", text: "翻訳結果" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://translator.example/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("example-model");
    expect(body.thinking).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("Japanese");
    expect(body.messages[0].content).toContain("line-break structure");
    expect(body.messages[0].content).toContain("accurate, idiomatic translation");
    expect(body.messages[0].content).toContain("intended meaning rather than the source text word for word");
    expect(body.messages[0].content).toContain("do not preserve wording or sentence structure");
    expect(body.messages[0].content).toContain("Keep proper names in their original form");
    expect(body.messages[0].content).toContain("product, model, library, and API names");
    expect(body.messages[0].content).toContain("LLM");
    expect(body.messages[0].content).toContain("Attention in a Transformer context");
    expect(body.messages[0].content.indexOf("<translation_instructions>"))
      .toBeLessThan(body.messages[0].content.indexOf("Return one JSON object"));
    expect(JSON.parse(body.messages[1].content)).toEqual({
      units: [{ id: "unit-0", role: "paragraph", text: "Original\n\ntext" }],
    });
  });

  it("replaces translation preferences without replacing the response contract", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.translationInstructions = "Use concise language for domain experts.";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: [{ id: "unit-0", text: "Translated" }],
      }) } }],
    }), { status: 200 }));

    await translateRegionWithProvider(
      [{ id: "unit-0", role: "text", text: "Original" }],
      settings,
      new AbortController().signal,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const systemPrompt = body.messages[0].content as string;
    expect(systemPrompt).toContain("Use concise language for domain experts.");
    expect(systemPrompt).not.toContain("Attention in a Transformer context");
    expect(systemPrompt).toContain("Translate every Translation Unit into Simplified Chinese.");
    expect(systemPrompt).toContain("Return one JSON object");
    expect(systemPrompt).toContain("Do not omit, merge, duplicate, or invent Translation Units.");
  });

  it("accepts a complete chat completions URL", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.providers.deepseek.baseUrl = "https://api.example/chat/completions";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: [{ id: "unit-0", text: "Translated" }],
      }) } }],
    }), { status: 200 }));

    await translateRegionWithProvider(
      [{ id: "unit-0", role: "text", text: "Original" }],
      settings,
      new AbortController().signal,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("rejects missing credentials before making a request", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      translateRegionWithProvider(
        [{ id: "unit-0", role: "text", text: "Original" }],
        settings,
        new AbortController().signal,
      ),
    ).rejects.toThrow("API key is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider and response shape failures", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));

    await expect(
      translateRegionWithProvider(
        [{ id: "unit-0", role: "text", text: "Original" }],
        settings,
        new AbortController().signal,
      ),
    ).rejects.toThrow("429");
    await expect(
      translateRegionWithProvider(
        [{ id: "unit-0", role: "text", text: "Original" }],
        settings,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });

  it("rejects responses that do not match the requested unit IDs", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        translations: [{ id: "different-unit", text: "Translated" }],
      }) } }],
    }), { status: 200 }));

    await expect(translateRegionWithProvider(
      [{ id: "unit-0", role: "paragraph", text: "Original" }],
      settings,
      new AbortController().signal,
    )).rejects.toThrow("mismatched Translation Unit IDs");
  });

  it("sends the complete Region in one user message", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const request = JSON.parse(body.messages[1].content);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          translations: request.units.map((unit: { id: string }) => ({
            id: unit.id,
            text: `translated-${unit.id}`,
          })),
        }) } }],
      }), { status: 200 });
    });
    const units = [
      { id: "unit-0", role: "heading" as const, text: "Heading" },
      { id: "unit-1", role: "paragraph" as const, text: "Paragraph" },
    ];

    const result = await translateRegionWithProvider(units, settings, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.messages).toHaveLength(2);
    expect(JSON.parse(body.messages[1].content)).toEqual({ units });
    expect(result).toEqual([
      { id: "unit-0", text: "translated-unit-0" },
      { id: "unit-1", text: "translated-unit-1" },
    ]);
  });
});
