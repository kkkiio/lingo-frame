/*
 * Derived from FluentRead entrypoints/main/dom.ts.
 * Upstream commit: ab1be13b31b9aaa874eb7e7d5ac652d722ba649a.
 * Modified by LingoFrame contributors, 2026-07-13.
 * SPDX-License-Identifier: GPL-3.0-only
 */

import type { TranslationUnitRole } from "../../shared/messages";

const DIRECT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "li", "dt", "dd", "blockquote", "figcaption",
  "td", "th", "caption",
]);

const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "iframe",
  "input", "textarea", "select", "option", "button",
  "pre", "svg", "canvas",
]);

const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "em", "i",
  "img", "mark", "q", "small", "span", "strong", "sub", "sup",
  "time", "u", "wbr",
]);

const ROLE_BY_TAG: ReadonlyMap<string, TranslationUnitRole> = new Map([
  ...["h1", "h2", "h3", "h4", "h5", "h6"].map((tag) => [tag, "heading"] as const),
  ["p", "paragraph"],
  ["li", "list-item"],
  ["blockquote", "quote"],
  ["td", "table-cell"],
  ["th", "table-cell"],
  ["caption", "caption"],
  ["figcaption", "caption"],
]);

export interface RegionTranslationUnit {
  id: string;
  element: HTMLElement;
  text: string;
  role: TranslationUnitRole;
  startsChunk: boolean;
  slot: {
    parent: Node;
    before: ChildNode | null;
  };
}

export function scanRegion(root: Element): RegionTranslationUnit[] {
  const candidates: HTMLElement[] = [];
  const elementWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!(node instanceof HTMLElement)) {
        return NodeFilter.FILTER_SKIP;
      }

      const tag = node.tagName.toLowerCase();
      if (
        SKIP_TAGS.has(tag) ||
        node.matches("pre code") ||
        node.hidden ||
        node.getAttribute("aria-hidden") === "true" ||
        node.matches("[contenteditable=''], [contenteditable='true'], .notranslate, .sr-only") ||
        node.closest("[data-lingo-frame-ui]")
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return NodeFilter.FILTER_REJECT;
      }

      const text = (node.innerText || node.textContent || "").trim();
      if (text.length < 2 || node.hasAttribute("data-lingo-frame-translated")) {
        return NodeFilter.FILTER_SKIP;
      }

      if (DIRECT_TAGS.has(tag)) {
        candidates.push(node);
        return NodeFilter.FILTER_SKIP;
      }

      const isInline = INLINE_TAGS.has(tag) || style.display === "contents" || style.display.startsWith("inline");
      if (!isInline) {
        candidates.push(node);
      }

      return NodeFilter.FILTER_SKIP;
    },
  });

  while (elementWalker.nextNode()) {
    // The NodeFilter performs candidate collection while preserving subtree traversal.
  }

  const uniqueCandidates = Array.from(new Set(candidates));
  const owners = root instanceof HTMLElement
    ? Array.from(new Set([root, ...uniqueCandidates]))
    : uniqueCandidates;
  const ownerSet = new Set(owners);
  const units: RegionTranslationUnit[] = [];
  const startedHeadings = new Set<HTMLElement>();

  for (const owner of owners) {
    const closestHeading = owner.closest<HTMLElement>("h1, h2, h3, h4, h5, h6");
    const heading = closestHeading && (
      closestHeading === root || root.contains(closestHeading)
    ) ? closestHeading : null;
    const role = heading
      ? "heading"
      : ROLE_BY_TAG.get(owner.tagName.toLowerCase()) ?? "text";
    const textParts: string[] = [];
    let lastTextNode: Text | null = null;
    let consecutiveBreaks = 0;
    let startsChunk = false;
    const textWalker = document.createTreeWalker(
      owner,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const isText = node instanceof Text;
          const isBreak = node instanceof HTMLElement && node.tagName.toLowerCase() === "br";
          if (!isText && !isBreak) {
            return NodeFilter.FILTER_SKIP;
          }
          if (isText && !node.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          let current: HTMLElement | null = isText ? node.parentElement : (node as HTMLElement);
          while (current) {
            const tag = current.tagName.toLowerCase();
            const style = getComputedStyle(current);
            const isSelectedPreformattedText = tag === "pre" && current === owner;
            if (
              (current !== owner && ownerSet.has(current)) ||
              (SKIP_TAGS.has(tag) && !isSelectedPreformattedText) ||
              current.matches("pre code") ||
              current.hidden ||
              current.getAttribute("aria-hidden") === "true" ||
              current.matches("[contenteditable=''], [contenteditable='true'], .notranslate, .sr-only") ||
              current.closest("[data-lingo-frame-ui]") ||
              current.hasAttribute("data-lingo-frame-translated") ||
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0"
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            if (current === owner) {
              break;
            }
            current = current.parentElement;
          }

          return current === owner ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      },
    );

    while (textWalker.nextNode()) {
      const current = textWalker.currentNode;
      if (current instanceof Text) {
        if (textParts.length === 0 && consecutiveBreaks >= 2) {
          startsChunk = true;
        }
        textParts.push(current.textContent ?? "");
        lastTextNode = current;
        consecutiveBreaks = 0;
        continue;
      }

      const text = textParts.join("").trim();
      if (text.length >= 2 && current.parentNode) {
        const startsAtHeading = heading !== null && !startedHeadings.has(heading);
        units.push({
          id: `unit-${units.length}`,
          element: owner,
          text,
          role,
          startsChunk: startsChunk || startsAtHeading,
          slot: { parent: current.parentNode, before: current as ChildNode },
        });
        if (heading) {
          startedHeadings.add(heading);
        }
      }
      textParts.length = 0;
      lastTextNode = null;
      startsChunk = false;
      consecutiveBreaks += 1;
    }

    const text = textParts.join("").trim();
    if (text.length >= 2) {
      let before: ChildNode | null = null;
      if (lastTextNode && uniqueCandidates.some((candidate) => owner.contains(candidate))) {
        let boundary: ChildNode = lastTextNode;
        while (boundary.parentElement && boundary.parentElement !== owner) {
          boundary = boundary.parentElement;
        }
        before = boundary.nextSibling;
      }
      const startsAtHeading = heading !== null && !startedHeadings.has(heading);
      units.push({
        id: `unit-${units.length}`,
        element: owner,
        text,
        role,
        startsChunk: startsChunk || startsAtHeading,
        slot: { parent: owner, before },
      });
      if (heading) {
        startedHeadings.add(heading);
      }
    }
  }

  return units;
}
