import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { scanRegion } from "../../src/content/region/scan-region";
import {
  serializeTranslationUnit,
  renderTranslationMarkdown,
} from "../../src/content/region/markdown";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { ProviderTranslationSession } from "../../src/translation/provider";

// Both arms use the same model, prompt, text, segment order, and two-turn context.
// Only the source representation differs; linguistic quality is reviewed from the artifact.
test("compares plain text and Markdown on formatted prose and ambiguous links", async () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.providers.deepseek.apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  if (!settings.providers.deepseek.apiKey)
    throw new Error("Set DEEPSEEK_API_KEY to run the live comparison.");
  document.body.innerHTML = `<article>
    <p>The rollout is <strong>paused, <em>not cancelled</em></strong>. Run <code>pnpm test</code> before trying again.</p>
    <p>To invalidate a stored response, choose <a href="https://example.org/cache/invalidation">this option</a>. Keep the request ID unchanged.</p>
    <p>Read <a href="https://example.org/install">the installation guide</a>, or click <a href="https://example.org/api/reference">here</a> for parameter details.</p>
    <ul><li>The median latency fell from <strong>120 ms to 80 ms</strong>, while the failure rate remained at 0.2%.</li></ul>
    <table><tr><td><code>cache_hit</code> counts successful lookups, not stored entries.</td></tr></table>
  </article>`;
  const ids = new Map<HTMLElement, string>();
  const sources = scanRegion(document.querySelector("article")!).flatMap((unit) =>
    serializeTranslationUnit(unit, ids).map((part, index) => ({
      ...part,
      id: `${unit.id}:segment-${index}`,
      unitId: unit.id,
      role: unit.role,
    })),
  );
  const originalFetch = globalThis.fetch.bind(globalThis);
  const usage: unknown[] = [];
  const capture = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const response = await originalFetch(url, init);
    if (response.ok) {
      const payload = await response.clone().json();
      usage.push(payload.usage ?? null);
    }
    return response;
  });
  const comparison: unknown[] = [];
  try {
    for (const format of ["plain", "markdown-urls", "markdown"] as const) {
      const session = new ProviderTranslationSession(settings);
      const segments = sources.map((source) => ({
        id: source.id,
        unitId: source.unitId,
        role: source.role,
        text:
          format === "plain"
            ? source.plainText
            : format === "markdown-urls"
              ? [...source.links].reduce(
                  (text, [id, url]) => text.replaceAll(`(${id})`, `(${url})`),
                  source.markdown,
                )
              : source.markdown,
      }));
      const started = performance.now();
      const usageStart = usage.length;
      const first = await session.translateChunk(segments.slice(0, 2), AbortSignal.timeout(45_000));
      const firstChunkMs = Math.round(performance.now() - started);
      const second = await session.translateChunk(segments.slice(2), AbortSignal.timeout(45_000));
      const translations = [...first, ...second];
      comparison.push({
        format,
        model: settings.providers.deepseek.model,
        firstChunkMs,
        totalMs: Math.round(performance.now() - started),
        usage: usage.slice(usageStart),
        samples: translations.map((translation, index) => ({
          source: segments[index]!.text,
          translation: translation.text,
        })),
      });
      expect(translations).toHaveLength(sources.length);
      expect(translations[0]!.text).toContain("pnpm test");
      expect(translations[3]!.text).toContain("0.2%");
      if (format === "markdown") {
        const firstOutput = renderTranslationMarkdown(translations[0]!.text, sources[0]!.links);
        expect(firstOutput.querySelector("strong em")).not.toBeNull();
        expect(firstOutput.querySelector("code")?.textContent).toBe("pnpm test");
        for (const index of [1, 2]) {
          const output = renderTranslationMarkdown(
            translations[index]!.text,
            sources[index]!.links,
          );
          expect(output.querySelectorAll("a")).toHaveLength(sources[index]!.links.size);
        }
      }
    }
  } finally {
    await mkdir("test-results", { recursive: true });
    await writeFile(
      "test-results/markdown-comparison.json",
      JSON.stringify(comparison, null, 2) + "\n",
    );
    capture.mockRestore();
    document.body.replaceChildren();
  }
});
