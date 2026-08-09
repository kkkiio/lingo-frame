import type { Settings } from "../shared/settings";

export const DEFAULT_TRANSLATION_INSTRUCTIONS = [
  "Produce an accurate, idiomatic translation appropriate for the text's domain and audience.",
  [
    "Translate the intended meaning rather than the source text word for word.",
    "Rewrite source-language syntax and information structure whenever needed so the result reads naturally in the target language.",
    "Preserve meaning and technical distinctions, but do not preserve wording or sentence structure at the expense of idiomatic expression.",
  ].join(" "),
  [
    "Use terminology that is conventional among practitioners in the relevant domain.",
    "Keep proper names in their original form, including product, model, library, and API names, as well as acronyms and initialisms such as LLM.",
    "Preserve a technical term in its original form when that form is more precise, recognizable, or natural than a localized translation.",
    "This includes context-dependent technical terms such as Attention in a Transformer context.",
    "Integrate preserved terms naturally into the target-language sentence.",
    "Do not force a localized equivalent or add a redundant translated gloss merely to translate the term.",
  ].join(" "),
  "Preserve the original tone unless the context clearly requires a more natural register in the target language.",
].join("\n\n");

export function createTranslationSystemPrompt(settings: Settings): string {
  const instructions = settings.translationInstructions ?? DEFAULT_TRANSLATION_INSTRUCTIONS;

  return [
    "You translate one ordered Region incrementally in a multi-turn LLM Session.",
    `Translate every Translation Segment in the latest user message into ${settings.targetLanguage}.`,
    "Earlier user and assistant messages are translation history for the same Region; use them as context for terminology, tone, and references.",
    "Translate only the latest segments and do not repeat translations from earlier turns.",
    "Preserve the input Segment order and produce exactly one translation for each Segment.",
    "Preserve meaning, factual content, URLs, numbers, relationships, and line-break structure within each segment.",
    "",
    "The following Translation Instructions control terminology, tone, register, audience, and writing style.",
    "They do not change the target language, Translation Segment order, or response format.",
    "",
    "<translation_instructions>",
    instructions,
    "</translation_instructions>",
    "",
    "Return one JSON object with a translations array of strings in exactly the same order as the Segments in the latest user message.",
    "The translations array length must exactly equal the input segments array length.",
    "Do not omit, merge, duplicate, reorder, or invent Translation Segments.",
    "Return no commentary or content outside the JSON object.",
  ].join("\n");
}
