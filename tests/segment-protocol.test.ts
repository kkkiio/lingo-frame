import { describe, expect, it } from "vitest";
import {
  SEGMENT_SEPARATORS,
  encodeSegments,
  parseTranslations,
  readSegmentSeparator,
  selectSegmentSeparator,
  splitSegments,
} from "../src/translation/segment-protocol";

describe("plain-text segment protocol", () => {
  it("encodes segments with the separator before each one", () => {
    const separator = SEGMENT_SEPARATORS[0];
    expect(encodeSegments(["First", "Second"], separator)).toBe(
      `${separator}\nFirst\n${separator}\nSecond`,
    );
  });

  it("round-trips translations that contain line breaks and blank lines", () => {
    const separator = SEGMENT_SEPARATORS[0];
    const translations = ["第一段。\n\n第二段。", "引用：\n> 一行"];
    const encoded = encodeSegments(translations, separator);
    expect(parseTranslations(encoded, translations.length, separator)).toEqual(translations);
  });

  it("tolerates leading, trailing, and duplicated separators", () => {
    const separator = SEGMENT_SEPARATORS[0];
    expect(splitSegments(`${separator}\nA\n${separator}\n${separator}\nB\n${separator}\n`, separator))
      .toEqual(["A", "B"]);
  });

  it("rejects replies whose segment count does not match the request", () => {
    const separator = SEGMENT_SEPARATORS[0];
    expect(parseTranslations("Only one", 2, separator)).toBeNull();
    expect(parseTranslations(`${separator}\nA\n${separator}\nB`, 1, separator)).toBeNull();
    expect(parseTranslations("", 1, separator)).toBeNull();
    expect(parseTranslations("{}", 2, separator)).toBeNull();
  });

  it("rejects a JSON envelope reply for a multi-segment request", () => {
    const separator = SEGMENT_SEPARATORS[0];
    expect(
      parseTranslations('{"translations":[{"role":"caption","text":"来源"}]}', 2, separator),
    ).toBeNull();
  });

  it("moves to an unused separator when the text already contains one", () => {
    expect(selectSegmentSeparator(["plain text"])).toBe(SEGMENT_SEPARATORS[0]);
    expect(selectSegmentSeparator([`contains ${SEGMENT_SEPARATORS[0]} inline`])).toBe(
      SEGMENT_SEPARATORS[1],
    );
    expect(
      selectSegmentSeparator(SEGMENT_SEPARATORS.map((separator) => `a ${separator} b`)),
    ).toBe("<<<LF-SEG-4>>>");
  });

  it("reads the separator declared by the first line of a user message", () => {
    expect(readSegmentSeparator(`${SEGMENT_SEPARATORS[0]}\nFirst`)).toBe(SEGMENT_SEPARATORS[0]);
    expect(readSegmentSeparator("First paragraph.")).toBeNull();
    expect(readSegmentSeparator("")).toBeNull();
  });
});
