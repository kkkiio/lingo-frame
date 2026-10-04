import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { scanRegion } from "../../src/content/region/scan-region";
import { serializeTranslationUnit } from "../../src/content/region/markdown";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { ProviderTranslationSession } from "../../src/translation/provider";
import { SEGMENT_SEPARATOR } from "../../src/translation/segment-protocol";
import source from "../fixtures/translation-sessions/food-culture.txt?raw";

test("preserves a multiline food-culture Unit alone and in a batch", async () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.providers.deepseek.apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  if (!settings.providers.deepseek.apiKey)
    throw new Error("Set DEEPSEEK_API_KEY to run live evals.");
  const originalFetch = globalThis.fetch.bind(globalThis);
  const evidence: unknown[] = [];
  const capture = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const request = JSON.parse(String(init?.body));
    const started = performance.now();
    const response = await originalFetch(url, init);
    const payload = await response.clone().json();
    const content = String(payload.choices?.[0]?.message?.content ?? "");
    evidence.push({
      request,
      status: response.status,
      elapsedMs: Math.round(performance.now() - started),
      markerCount: content.split(SEGMENT_SEPARATOR).length - 1,
      newlineRuns: content.match(/\r?\n+/g) ?? [],
      response: payload,
    });
    return response;
  });
  try {
    // The same complete Unit is tested alone, then between two distinct Units
    // in the same Session so transcript and boundary handling are exercised.
    document.body.innerHTML =
      "<article><p>Run <code>pnpm test</code> before translating.</p><p id='food'></p><p>Median latency fell from 120 ms to 80 ms.</p></article>";
    document.querySelector("#food")!.textContent = source.trim();
    const links = new Map<HTMLElement, string>();
    const segments = scanRegion(document.querySelector("article")!).map((unit) => ({
      id: `${unit.id}:segment-0`,
      unitId: unit.id,
      role: unit.role,
      text: serializeTranslationUnit(unit, links).markdown,
    }));
    expect(segments).toHaveLength(3);
    const food = segments[1]!;
    expect(food.text).toBe(source.trim());
    const session = new ProviderTranslationSession(settings);
    const single = await session.translateChunk([food], AbortSignal.timeout(45_000));
    const batch = await session.translateChunk(segments, AbortSignal.timeout(45_000));
    expect(single.map(({ id }) => id)).toEqual([food.id]);
    expect(batch.map(({ id }) => id)).toEqual(segments.map(({ id }) => id));
    for (const text of [single[0]!.text, batch[1]!.text]) {
      expect(text).not.toContain(SEGMENT_SEPARATOR);
      expect(text).toMatch(/日本/);
      expect(text).toMatch(/澳大利亚|澳洲/);
      expect(text).toMatch(/新西兰|纽西兰/);
      expect(text).toMatch(/重庆/);
      expect(text.indexOf("日本")).toBeLessThan(text.indexOf("重庆"));
      // Paragraph coverage is required; exact newline fidelity is recorded in
      // the raw response for review, since models may expand a newline to a blank line.
      expect(text.split(/\n+/)).toHaveLength(2);
    }
    expect(batch[0]!.text).toContain("pnpm test");
    expect(batch[2]!.text).toContain("120");
    expect(batch[2]!.text).toContain("80");
  } finally {
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/unit-protocol-live.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    capture.mockRestore();
    document.body.replaceChildren();
  }
});
