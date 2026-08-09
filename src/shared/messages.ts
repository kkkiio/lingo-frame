import type { Settings } from "./settings";

export type TranslationUnitRole =
  | "heading"
  | "paragraph"
  | "list-item"
  | "quote"
  | "table-cell"
  | "caption"
  | "text";

export interface TranslationSegment {
  id: string;
  unitId: string;
  role: TranslationUnitRole;
  text: string;
}

export interface TranslationChunk {
  id: string;
  segments: TranslationSegment[];
}

export const TRANSLATION_SESSION_PORT = "LINGO_FRAME_TRANSLATION_SESSION";

export type TranslationSessionCommand =
  | {
    type: "START_TRANSLATION_SESSION";
    sessionId: string;
    chunks: TranslationChunk[];
  }
  | {
    type: "CANCEL_TRANSLATION_SESSION";
    sessionId: string;
  };

export type TranslationSessionEvent =
  | {
    type: "TRANSLATION_CHUNK_COMPLETED";
    sessionId: string;
    chunkId: string;
    translations: TranslationResult[];
  }
  | {
    type: "TRANSLATION_SESSION_COMPLETED";
    sessionId: string;
  }
  | {
    type: "TRANSLATION_SESSION_FAILED";
    sessionId: string;
    error: string;
  };

export interface TestProviderMessage {
  type: "TEST_PROVIDER";
  settings: Settings;
}

export type RuntimeMessage = TestProviderMessage;

export interface TranslationResult {
  id: string;
  text: string;
}

export type TranslationResponse =
  | { ok: true }
  | { ok: false; error: string };
