import type { Settings } from "../shared/settings";

export const DEFAULT_TRANSLATION_INSTRUCTIONS = [
  "Produce a faithful, natural translation appropriate for the text's domain and audience.",
  [
    "Use terminology that is conventional among practitioners in the relevant domain.",
    "Preserve a term in its original form when that form is more precise, recognizable, or natural than a localized translation.",
    "This includes acronyms and initialisms such as LLM, product, model, library, and API names, and context-dependent technical terms such as Attention in a Transformer context.",
    "Integrate preserved terms naturally into the target-language sentence.",
    "Do not force a localized equivalent or add a redundant translated gloss merely to translate the term.",
    "Translate ordinary prose normally.",
  ].join(" "),
  "Preserve the original tone unless the context clearly requires a more natural register in the target language.",
].join("\n\n");

export function createTranslationSystemPrompt(settings: Settings): string {
  const instructions = settings.translationInstructions ?? DEFAULT_TRANSLATION_INSTRUCTIONS;

  return [
    "You translate an ordered Region consisting of multiple Translation Units.",
    `Translate every Translation Unit into ${settings.targetLanguage}.`,
    "Use all units as shared context while preserving the one-to-one mapping between each input unit and its translation.",
    "Preserve meaning, factual content, URLs, numbers, relationships, and paragraph or line-break structure within each unit.",
    "",
    "The following Translation Instructions control terminology, tone, register, audience, and writing style.",
    "They do not change the target language, Translation Unit mapping, or response format.",
    "",
    "<translation_instructions>",
    instructions,
    "</translation_instructions>",
    "",
    "Return one JSON object with a translations array containing exactly every input Translation Unit ID.",
    "Each translations item must contain only the id and text fields.",
    "Do not omit, merge, duplicate, or invent Translation Units.",
    "Return no commentary or content outside the JSON object.",
  ].join("\n");
}
