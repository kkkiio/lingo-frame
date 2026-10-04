import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationSegment } from "../src/shared/messages";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";
import { ProviderTranslationSession } from "../src/translation/provider";
import {
  SEGMENT_SEPARATOR,
  encodeSegments,
  isSegmentMessage,
  splitSegments,
} from "../src/translation/segment-protocol";

function completion(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function lastUserMessage(init: RequestInit | undefined): {
  body: Record<string, any>;
  content: string;
  segments: string[];
} {
  const body = JSON.parse(String(init?.body));
  const content = String(body.messages.at(-1).content);
  expect(isSegmentMessage(content)).toBe(true);
  return { body, content, segments: splitSegments(content) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProviderTranslationSession", () => {
  it("calls an OpenAI-compatible endpoint with the selected target language", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.provider = "openai-compatible";
    settings.targetLanguage = { kind: "preset", code: "ja" };
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
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion(`${SEGMENT_SEPARATOR}\n翻訳結果`));

    const session = new ProviderTranslationSession(settings);
    const result = await session.translateChunk([segment], new AbortController().signal);

    expect(result).toEqual([{ id: segment.id, text: "翻訳結果" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://translator.example/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const request = lastUserMessage(init);
    expect(request.body).toMatchSnapshot();
    expect(request.body.model).toBe("example-model");
    expect(request.body.thinking).toBeUndefined();
    expect(request.body.response_format).toBeUndefined();
    expect(request.body.messages[0].content).toContain("Japanese");
    expect(request.body.messages[0].content).toContain(SEGMENT_SEPARATOR);
    expect(request.content).toBe(`${SEGMENT_SEPARATOR}\nOriginal text`);
    expect(request.segments).toEqual([segment.text]);
  });

  it("uses custom translation instructions", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.translationInstructions = {
      mode: "custom",
      customText: "Use concise language for domain experts.",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion(encodeSegments(["Translated"])));

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk(
      [
        {
          id: "unit-0:segment-0",
          unitId: "unit-0",
          role: "text",
          text: "Original",
        },
      ],
      new AbortController().signal,
    );

    expect(lastUserMessage(fetchMock.mock.calls[0]?.[1]).body).toMatchSnapshot();
  });

  it("accepts a complete endpoint URL and disables DeepSeek thinking", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.providers.deepseek.baseUrl = "https://api.example/chat/completions";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion(encodeSegments(["Translated"])));

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk(
      [
        {
          id: "unit-0:segment-0",
          unitId: "unit-0",
          role: "text",
          text: "Original",
        },
      ],
      new AbortController().signal,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example/chat/completions");
    const request = lastUserMessage(fetchMock.mock.calls[0]?.[1]);
    expect(request.body).toMatchSnapshot();
    expect(request.body.thinking).toEqual({ type: "disabled" });
  });

  it("rejects missing credentials before making a request", () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => new ProviderTranslationSession(settings)).toThrow("missingApiKey");
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
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          statusText: "Too Many Requests",
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        completion(`${SEGMENT_SEPARATOR}\nTranslated\n${SEGMENT_SEPARATOR}\nUnexpected extra`),
      );

    await expect(
      new ProviderTranslationSession(settings).translateChunk(
        [segment],
        new AbortController().signal,
      ),
    ).rejects.toThrow("429");
    await expect(
      new ProviderTranslationSession(settings).translateChunk(
        [segment],
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      new ProviderTranslationSession(settings).translateChunk(
        [segment],
        new AbortController().signal,
      ),
    ).rejects.toThrow("invalidResponse");
  });

  it("rejects the object-array reply shape that motivated ADR-0003", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    const segments: TranslationSegment[] = ["caption-0", "paragraph-0"].map((id) => ({
      id: `unit-${id}`,
      unitId: `unit-${id}`,
      role: "text",
      text: `Source text ${id}`,
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completion(
        JSON.stringify({
          translations: [
            { role: "caption", text: "来源：SemiAnalysis" },
            { role: "paragraph", text: "**卸载释放了 HBM**" },
          ],
        }),
      ),
    );

    await expect(
      new ProviderTranslationSession(settings).translateChunk(
        segments,
        new AbortController().signal,
      ),
    ).rejects.toThrow("invalidResponse");
    expect(fetchMock).toHaveBeenCalledOnce();
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
      const request = lastUserMessage(init);
      return completion(encodeSegments(request.segments.map((text) => `translated-${text}`)));
    });

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk([first], new AbortController().signal);
    const result = await session.translateChunk(
      [
        second,
        {
          ...second,
          id: "unit-2:segment-0",
          unitId: "unit-2",
          text: "Closing",
        },
      ],
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.messages.map(({ role }: { role: string }) => role)).toEqual([
      "system",
      "user",
    ]);
    expect(secondBody.messages.map(({ role }: { role: string }) => role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);

    expect(secondBody.messages[1].content).toBe(encodeSegments([first.text]));
    expect(secondBody.messages[2].content).toBe(encodeSegments([`translated-${first.text}`]));
    expect(secondBody.messages[3].content).toBe(
      `${SEGMENT_SEPARATOR}\nNext section\n${SEGMENT_SEPARATOR}\nClosing`,
    );
    expect(isSegmentMessage(secondBody.messages[2].content)).toBe(true);
    expect(result).toEqual([
      { id: second.id, text: `translated-${second.text}` },
      { id: "unit-2:segment-0", text: "translated-Closing" },
    ]);
  });

  it("sends source text that contains the separator verbatim", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    const segment: TranslationSegment = {
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "text",
      text: `Keep ${SEGMENT_SEPARATOR} unchanged`,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion(encodeSegments(["译文"])));

    const session = new ProviderTranslationSession(settings);
    const result = await session.translateChunk([segment], new AbortController().signal);

    // The fixed marker travels verbatim; collisions fail the translation count.
    expect(lastUserMessage(fetchMock.mock.calls[0]?.[1]).content).toBe(
      `${SEGMENT_SEPARATOR}\nKeep ${SEGMENT_SEPARATOR} unchanged`,
    );
    expect(result).toEqual([{ id: segment.id, text: "译文" }]);

    fetchMock.mockResolvedValueOnce(
      completion(`${SEGMENT_SEPARATOR}\n保留 ${SEGMENT_SEPARATOR} 不变`),
    );
    await expect(session.translateChunk([segment], new AbortController().signal)).rejects.toThrow(
      "invalidResponse",
    );
  });
});
