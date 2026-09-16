import { afterEach, describe, expect, it } from "vitest";
import { scanRegion } from "../src/content/region/scan-region";
import {
  renderTranslationMarkdown,
  serializeTranslationUnit,
} from "../src/content/region/markdown";

afterEach(() => document.body.replaceChildren());

describe("formatted bilingual content", () => {
  it("preserves nested emphasis, commands, and link labels within their paragraphs", () => {
    document.body.innerHTML = `<article id="selected"><p>Read <strong>the <em>full guide</em></strong>, then run <code>pnpm test</code> and <a href="https://example.org/guide">continue</a>.</p><p hidden>Private</p></article><p>Outside</p>`;
    const units = scanRegion(document.querySelector("#selected")!);
    const [segment] = serializeTranslationUnit(units[0]!, new Map());
    expect(units).toHaveLength(1);
    expect(segment!.markdown).toBe(
      "Read **the *full guide***, then run `pnpm test` and [continue](lf-link:1).",
    );
    const output = renderTranslationMarkdown(
      "阅读 **完整的*指南***，运行 `pnpm test` 并[继续](lf-link:1)。",
      segment!.links,
    );
    const slot = document.createElement("span");
    slot.append(output);
    expect(slot.querySelector("strong em")?.textContent).toBe("指南");
    expect(slot.querySelector("code")?.textContent).toBe("pnpm test");
    expect(slot.querySelector("a")?.href).toBe("https://example.org/guide");
    expect(slot.querySelector("a")?.rel).toBe("noopener noreferrer");
  });

  it("closes formatting at blank-line boundaries and restores exact separators", () => {
    document.body.innerHTML =
      '<div id="selected"><strong>First\n\nSecond</strong> paragraph.\n\nThird <code>a`b</code>.</div>';
    const parts = serializeTranslationUnit(
      scanRegion(document.querySelector("#selected")!)[0]!,
      new Map(),
    );
    expect(parts.map(({ markdown, separatorBefore }) => ({ markdown, separatorBefore }))).toEqual([
      { markdown: "**First**", separatorBefore: "" },
      { markdown: "**Second** paragraph.", separatorBefore: "\n\n" },
      { markdown: "Third ``a`b``.", separatorBefore: "\n\n" },
    ]);
  });

  it("keeps literal Markdown punctuation and single line breaks readable", () => {
    const root = document.createElement("pre");
    root.textContent = "1. Use * literally\nwith [brackets] and a_b.";
    document.body.append(root);
    const part = serializeTranslationUnit(scanRegion(root)[0]!, new Map())[0]!;
    const slot = document.createElement("span");
    slot.append(renderTranslationMarkdown(part.markdown, part.links));
    expect(slot.innerHTML).toBe("1. Use * literally<br>with [brackets] and a_b.");
  });

  it("assigns stable distinct links and limits restoration to the current segment", () => {
    document.body.innerHTML =
      '<article><p><a href="https://example.org/one">First</a></p><p><a href="https://example.org/two">Second</a></p></article>';
    const ids = new Map<HTMLElement, string>();
    const parts = scanRegion(document.querySelector("article")!).flatMap((unit) =>
      serializeTranslationUnit(unit, ids),
    );
    expect(parts.map(({ markdown }) => markdown)).toEqual([
      "[First](lf-link:1)",
      "[Second](lf-link:2)",
    ]);
    const slot = document.createElement("span");
    slot.append(
      renderTranslationMarkdown("[第二](lf-link:2) [错误引用](lf-link:1)", parts[1]!.links),
    );
    expect(slot.querySelectorAll("a")).toHaveLength(1);
    expect(slot.textContent).toBe("第二 错误引用");
    expect(slot.querySelector("a")?.href).toBe("https://example.org/two");
  });

  it("keeps a translation selected inside a link in the existing anchor", () => {
    document.body.innerHTML =
      '<a href="https://example.org/guide">Read the guide<span id="slot"></span></a>';
    const slot = document.querySelector("#slot")!;
    slot.append(
      renderTranslationMarkdown(
        "[阅读指南](lf-link:1)",
        new Map([["lf-link:1", "https://example.org/guide"]]),
        !slot.closest("a"),
      ),
    );
    expect(document.querySelectorAll("a")).toHaveLength(1);
    expect(slot.textContent).toBe("阅读指南");
  });

  it("renders untrusted markup as inert content", () => {
    const slot = document.createElement("span");
    slot.append(
      renderTranslationMarkdown(
        "<img src=x onerror=alert(1)> ![remote](https://example.org/image) [click](javascript:alert(1)) <script>alert(1)</script>",
        new Map(),
      ),
    );
    expect(slot.querySelectorAll("img, script, iframe, a, [onerror]")).toHaveLength(0);
    expect(slot.textContent).toContain("alert(1)");
    document.body.innerHTML =
      '<p>Visit <a href="javascript:alert(1)">this page</a> or <a href="https://example.org">https://example.org</a>.</p>';
    const segment = serializeTranslationUnit(
      scanRegion(document.querySelector("p")!)[0]!,
      new Map(),
    )[0]!;
    expect(segment.markdown).toContain("Visit this page");
    expect(segment.markdown).toContain("[https://example.org](lf-link:1)");
    expect(segment.links.size).toBe(1);
  });
});
