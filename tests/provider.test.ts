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
      [{ id: "unit-0", role: "paragraph", text: "Original text" }],
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
    expect(JSON.parse(body.messages[1].content)).toEqual({
      units: [{ id: "unit-0", role: "paragraph", text: "Original text" }],
    });
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
