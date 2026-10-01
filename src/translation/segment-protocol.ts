/*
 * Plain-text Translation Segment protocol (ADR-0003).
 *
 * Segments travel as plain text separated by a fixed literal instead of a JSON
 * envelope: the separator is declared in the user message, the provider only
 * copies it, and the reply is split by that same literal. The module is pure so
 * the extension and the test servers share one implementation.
 */

export const SEGMENT_SEPARATORS = ["<<<LFSEG>>>", "<<<LF-SEG>>>", "<<<LF-SEG-2>>>"] as const;

const SEPARATOR_PATTERN = /^<<<LF[A-Z0-9-]*>>>$/;
const MAX_CANDIDATES = 32;

export function selectSegmentSeparator(texts: readonly string[]): string {
  for (let index = 0; index < MAX_CANDIDATES; index += 1) {
    const candidate = SEGMENT_SEPARATORS[index] ?? `<<<LF-SEG-${index + 1}>>>`;
    if (texts.every((text) => !text.includes(candidate))) {
      return candidate;
    }
  }
  return `<<<LF-SEG-${crypto.randomUUID()}>>>`;
}

export function encodeSegments(texts: readonly string[], separator: string): string {
  return texts.map((text) => `${separator}\n${text.trim()}`).join("\n");
}

export function readSegmentSeparator(content: string): string | null {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";
  return SEPARATOR_PATTERN.test(firstLine) ? firstLine : null;
}

export function splitSegments(content: string, separator: string): string[] {
  return content
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseTranslations(
  content: string,
  expectedCount: number,
  separator: string,
): string[] | null {
  if (expectedCount < 1) {
    return null;
  }
  const translations = splitSegments(content, separator);
  return translations.length === expectedCount ? translations : null;
}
