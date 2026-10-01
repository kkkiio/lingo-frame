import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslationSegment } from "../src/shared/messages";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";
import { ProviderTranslationSession } from "../src/translation/provider";
import {
  SEGMENT_SEPARATORS,
  encodeSegments,
  readSegmentSeparator,
  splitSegments,
} from "../src/translation/segment-protocol";

const separator = SEGMENT_SEPARATORS[0];

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
  separator: string;
  segments: string[];
} {
  const body = JSON.parse(String(init?.body));
  const content = String(body.messages.at(-1).content);
  const declared = readSegmentSeparator(content);
  expect(declared).not.toBeNull();
  return {
    body,
    content,
    separator: declared!,
    segments: splitSegments(content, declared!),
  };
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
      .mockResolvedValue(completion(`${separator}\n翻訳結果`));

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
    expect(request.body.messages[0].content).toContain("separator");
    expect(request.content).toBe(`${separator}\nOriginal text`);
    expect(request.segments).toEqual([segment.text]);
  });

  it("uses custom translation instructions", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    settings.translationInstructions = {
      mode: "custom",
      customText: "Use concise language for domain experts.",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(completion("Translated"));

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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(completion("Translated"));

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
        completion(`${separator}\nTranslated\n${separator}\nUnexpected extra translation`),
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
      return completion(
        encodeSegments(
          request.segments.map((text) => `translated-${text}`),
          request.separator,
        ),
      );
    });

    const session = new ProviderTranslationSession(settings);
    await session.translateChunk([first], new AbortController().signal);
    const result = await session.translateChunk([second], new AbortController().signal);

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

    const firstSeparator = readSegmentSeparator(firstBody.messages[1].content)!;
    const secondSeparator = readSegmentSeparator(secondBody.messages[3].content)!;
    expect(firstSeparator).toBe(secondSeparator);
    expect(secondBody.messages[1].content).toBe(encodeSegments([first.text], firstSeparator));
    expect(secondBody.messages[2].content).toBe(
      encodeSegments([`translated-${first.text}`], firstSeparator),
    );
    expect(secondBody.messages[3].content).toBe(encodeSegments([second.text], secondSeparator));
    expect(result).toEqual([{ id: second.id, text: `translated-${second.text}` }]);
  });

  it("switches separators when the source text already contains one", async () => {
    const settings: Settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.deepseek.apiKey = "test-key";
    const segment: TranslationSegment = {
      id: "unit-0:segment-0",
      unitId: "unit-0",
      role: "text",
      text: `Keep ${SEGMENT_SEPARATORS[0]} unchanged`,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion(`${SEGMENT_SEPARATORS[1]}\n译文`));

    const session = new ProviderTranslationSession(settings);
    const result = await session.translateChunk([segment], new AbortController().signal);

    expect(lastUserMessage(fetchMock.mock.calls[0]?.[1]).separator).toBe(SEGMENT_SEPARATORS[1]);
    expect(result).toEqual([{ id: segment.id, text: "译文" }]);
  });
});
