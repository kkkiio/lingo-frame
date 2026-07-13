import type { Settings } from "./settings";

export type TranslationUnitRole =
  | "heading"
  | "paragraph"
  | "list-item"
  | "quote"
  | "table-cell"
  | "caption"
  | "text";

export interface LLMSessionUnit {
  id: string;
  role: TranslationUnitRole;
  text: string;
}

export interface TranslateRegionMessage {
  type: "TRANSLATE_REGION";
  requestId: string;
  units: LLMSessionUnit[];
}

export interface CancelTranslationMessage {
  type: "CANCEL_TRANSLATION";
  requestId: string;
}

export interface TestProviderMessage {
  type: "TEST_PROVIDER";
  settings: Settings;
}

export type RuntimeMessage =
  | TranslateRegionMessage
  | CancelTranslationMessage
  | TestProviderMessage;

export interface TranslationResult {
  id: string;
  text: string;
}

export type TranslationResponse =
  | { ok: true; translations: TranslationResult[] }
  | { ok: false; error: string };
