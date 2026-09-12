import type { Settings } from "../shared/settings";

export const DEFAULT_TRANSLATION_INSTRUCTIONS = [
  "Write natural, accurate translations suited to the subject and audience.",
  "Preserve meaning and tone without copying source-language sentence structure.",
  "Keep proper names and acronyms unchanged. Use established technical terminology, retaining original terms where customary or more precise.",
].join("\n");

export function createTranslationSystemPrompt(settings: Settings): string {
  const instructions = settings.translationInstructions ?? DEFAULT_TRANSLATION_INSTRUCTIONS;

  return [
    `Translate the segments in the latest user message into ${settings.targetLanguage}.`,
    "Use earlier translations for consistent terminology and references.",
    "Preserve facts, commands, URLs, numbers, and line breaks.",
    "",
    "<translation_instructions>",
    instructions,
    "</translation_instructions>",
    "",
    'Return only JSON: {"translations":["..."]}.',
    "Provide one translated string per input segment, in the same order.",
  ].join("\n");
}
