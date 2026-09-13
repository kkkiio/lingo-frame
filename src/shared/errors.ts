import { z } from "zod";

export const failureSchema = z.object({
  code: z.enum([
    "missingApiKey",
    "invalidResponse",
    "invalidSession",
    "httpError",
    "networkError",
    "timeout",
    "connectionClosed",
    "permissionDenied",
    "settingsError",
    "unknownError",
  ]),
  status: z.number().int().min(100).max(599).optional(),
});
export type TranslationFailure = z.infer<typeof failureSchema>;

export class TranslationError extends Error {
  constructor(readonly failure: TranslationFailure) {
    super(`${failure.code}${failure.status ? ` (${failure.status})` : ""}`);
    this.name = "TranslationError";
  }

  static describe(error: unknown): TranslationFailure {
    if (error instanceof TranslationError) {
      return error.failure;
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return { code: "invalidResponse" };
    }
    if (error instanceof Error && error.name === "AbortError") {
      return { code: "timeout" };
    }
    if (error instanceof TypeError) {
      return { code: "networkError" };
    }
    const parsed = failureSchema.safeParse(error);
    if (parsed.success) {
      return parsed.data;
    }
    return { code: "unknownError" };
  }
}
