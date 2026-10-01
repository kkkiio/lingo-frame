/*
 * Plain-text Translation Segment protocol (ADR-0003).
 *
 * Segments travel as plain text separated by a fixed literal instead of a JSON
 * envelope: the system message states the literal, the user message repeats it
 * before every segment, and the reply is split by that same literal. The module
 * is pure so the extension and the test servers share one implementation.
 */

export const SEGMENT_SEPARATOR = "<<<LFSEG>>>";

/** True when the first line of a message declares the segment separator. */
export function isSegmentMessage(content: string): boolean {
  return (content.split("\n", 1)[0] ?? "").trim() === SEGMENT_SEPARATOR;
}

export function encodeSegments(texts: readonly string[]): string {
  return texts.map((text) => `${SEGMENT_SEPARATOR}\n${text.trim()}`).join("\n");
}

export function splitSegments(content: string): string[] {
  return content
    .split(SEGMENT_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseTranslations(content: string, expectedCount: number): string[] | null {
  if (expectedCount < 1) {
    return null;
  }
  const translations = splitSegments(content);
  return translations.length === expectedCount ? translations : null;
}
