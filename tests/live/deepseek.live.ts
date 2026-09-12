import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { scanRegion } from "../../src/content/region/scan-region";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { ProviderTranslationSession } from "../../src/translation/provider";
import article from "../fixtures/region-scanning/inline-code--article.html?raw";

test("translates inline commands with DeepSeek across two turns", async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Set DEEPSEEK_API_KEY in .env or the environment to run pnpm test:live.");
  }
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.providers.deepseek.apiKey = apiKey;
  document.body.innerHTML = article;
  const segments = scanRegion(document.querySelector("#selected")!).map(({ id, role, text }) => ({
    id: `${id}:segment-0`,
    unitId: id,
    role,
    text,
  }));
  const requests: unknown[] = [];
  const fetch = globalThis.fetch.bind(globalThis);
  const capture = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return fetch(url, init);
  });

  try {
    const session = new ProviderTranslationSession(settings);
    const first = await session.translateChunk(segments.slice(0, 2), AbortSignal.timeout(45_000));
    const second = await session.translateChunk(segments.slice(2), AbortSignal.timeout(45_000));
    const translations = [...first, ...second];
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/deepseek-live.json", JSON.stringify({
      requests,
      translations: segments.map((segment, index) => ({
        source: segment.text,
        translation: translations[index]?.text,
      })),
    }, null, 2) + "\n");

    expect(translations.map(({ id }) => id)).toEqual(segments.map(({ id }) => id));
    expect(first[1]?.text).toContain("/plan");
    expect(first[1]?.text).toContain("/prewalk");
    expect(second[0]?.text).toContain("/plan");
    expect(second[0]?.text).toContain("/prewalk");
    expect(second[1]?.text).toContain("pnpm test");
    expect(translations.every(({ text }) => /\p{Script=Han}/u.test(text))).toBe(true);
  } finally {
    capture.mockRestore();
    document.body.replaceChildren();
  }
});
