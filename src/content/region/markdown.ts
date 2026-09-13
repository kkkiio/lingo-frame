import TurndownService from "turndown";
import MarkdownIt from "markdown-it";
import type { RegionTranslationUnit } from "./scan-region";

export interface MarkdownSegment {
  markdown: string;
  plainText: string;
  separatorBefore: string;
  links: Map<string, string>;
}

const turndown = new TurndownService({ emDelimiter: "*", strongDelimiter: "**" });
// Keep source text-node line breaks; the wrapper is local and contains only accepted runs.
turndown.addRule("segment", { filter: "pre", replacement: (content) => content });
const markdown = new MarkdownIt("zero", { html: false, breaks: true, linkify: false }).enable([
  "escape",
  "entity",
  "newline",
  "backticks",
  "emphasis",
  "link",
  "text",
]);

export function serializeTranslationUnit(
  unit: RegionTranslationUnit,
  linkIds: Map<HTMLElement, string>,
): MarkdownSegment[] {
  const source = unit.runs.map(({ text }) => text).join("");
  const boundaries = [...source.matchAll(/\r?\n[^\S\r\n]*\r?\n+/g)];
  const segments: MarkdownSegment[] = [];
  let start = 0;
  let separatorBefore = "";
  for (const boundary of [...boundaries, null]) {
    const end = boundary?.index ?? source.length;
    const part = source.slice(start, end);
    const trimmed = part.trim();
    const from = start + part.indexOf(trimmed);
    const to = from + trimmed.length;
    if (trimmed) {
      const fragment = document.createElement("pre");
      const links = new Map<string, string>();
      let offset = 0;
      let previousAncestors: HTMLElement[] = [];
      const stack: HTMLElement[] = [fragment];
      for (const run of unit.runs) {
        const runEnd = offset + run.text.length;
        const text = run.text.slice(
          Math.max(0, from - offset),
          Math.max(0, Math.min(run.text.length, to - offset)),
        );
        offset = runEnd;
        if (!text) continue;
        let common = 0;
        while (
          common < previousAncestors.length &&
          previousAncestors[common] === run.ancestors[common]
        )
          common += 1;
        stack.length = common + 1;
        for (const ancestor of run.ancestors.slice(common)) {
          const tag =
            ancestor.localName === "b"
              ? "strong"
              : ancestor.localName === "i"
                ? "em"
                : ancestor.localName;
          const clone = document.createElement(tag);
          if (tag === "a" && ancestor.hasAttribute("href")) {
            try {
              const url = new URL(ancestor.getAttribute("href")!, ancestor.baseURI);
              if (["https:", "http:", "mailto:"].includes(url.protocol)) {
                let id = linkIds.get(ancestor);
                if (!id) {
                  id = `lf-link:${linkIds.size + 1}`;
                  linkIds.set(ancestor, id);
                }
                links.set(id, url.href);
                clone.setAttribute("href", id);
              }
            } catch {
              /* Invalid destinations leave readable link labels. */
            }
          }
          stack.at(-1)!.append(clone);
          stack.push(clone);
        }
        stack.at(-1)!.append(document.createTextNode(text));
        previousAncestors = run.ancestors;
      }
      segments.push({
        markdown: turndown.turndown(fragment),
        plainText: trimmed,
        separatorBefore,
        links,
      });
    }
    start = end + (boundary?.[0].length ?? 0);
    separatorBefore = boundary?.[0] ?? "";
  }
  return segments;
}

export function renderTranslationMarkdown(
  source: string,
  links: ReadonlyMap<string, string>,
  allowLinks = true,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const stack: Array<DocumentFragment | HTMLElement> = [fragment];
  const tokens = markdown.parseInline(source, {})[0]?.children ?? [];
  for (const token of tokens) {
    if (token.nesting === -1) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.type === "text" || token.type === "html_inline") {
      stack.at(-1)!.append(document.createTextNode(token.content));
    } else if (token.type === "code_inline") {
      const code = document.createElement("code");
      code.textContent = token.content;
      stack.at(-1)!.append(code);
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      stack.at(-1)!.append(document.createElement("br"));
    } else if (token.nesting === 1) {
      let element: HTMLElement | DocumentFragment = document.createDocumentFragment();
      if (token.tag === "strong" || token.tag === "em") element = document.createElement(token.tag);
      if (token.type === "link_open") {
        const href = links.get(String(token.attrGet("href") ?? ""));
        if (allowLinks && href && /^(https?:|mailto:)/i.test(href)) {
          const anchor = document.createElement("a");
          anchor.href = href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          element = anchor;
        }
      }
      if (element instanceof DocumentFragment) {
        stack.push(stack.at(-1)!);
      } else {
        stack.at(-1)!.append(element);
        stack.push(element);
      }
    } else if (token.content) {
      stack.at(-1)!.append(document.createTextNode(token.content));
    }
  }
  return fragment;
}
