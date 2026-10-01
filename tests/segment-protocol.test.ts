import { describe, expect, it } from "vitest";
import {
  SEGMENT_SEPARATOR,
  encodeSegments,
  isSegmentMessage,
  parseTranslations,
  splitSegments,
} from "../src/translation/segment-protocol";

describe("plain-text segment protocol", () => {
  it("encodes segments with the separator before each one", () => {
    expect(encodeSegments(["First", "Second"])).toBe(
      `${SEGMENT_SEPARATOR}\nFirst\n${SEGMENT_SEPARATOR}\nSecond`,
    );
  });

  it("round-trips translations that contain line breaks and blank lines", () => {
    const translations = ["第一段。\n\n第二段。", "引用：\n> 一行"];
    expect(parseTranslations(encodeSegments(translations), translations.length)).toEqual(translations);
  });

  it("tolerates leading, trailing, and duplicated separators", () => {
    expect(
      splitSegments(`${SEGMENT_SEPARATOR}\nA\n${SEGMENT_SEPARATOR}\n${SEGMENT_SEPARATOR}\nB\n`),
    ).toEqual(["A", "B"]);
  });

  it("rejects replies whose segment count does not match the request", () => {
    expect(parseTranslations("Only one", 2)).toBeNull();
    expect(parseTranslations(`${SEGMENT_SEPARATOR}\nA\n${SEGMENT_SEPARATOR}\nB`, 1)).toBeNull();
    expect(parseTranslations("", 1)).toBeNull();
    expect(parseTranslations("{}", 2)).toBeNull();
  });

  it("rejects a JSON envelope reply for a multi-segment request", () => {
    expect(parseTranslations('{"translations":[{"role":"caption","text":"来源"}]}', 2)).toBeNull();
  });

  it("recognises a message that declares the separator on its first line", () => {
    expect(isSegmentMessage(`${SEGMENT_SEPARATOR}\nFirst`)).toBe(true);
    expect(isSegmentMessage(`  ${SEGMENT_SEPARATOR}  \nFirst`)).toBe(true);
    expect(isSegmentMessage("First paragraph.")).toBe(false);
    expect(isSegmentMessage("")).toBe(false);
  });
});
