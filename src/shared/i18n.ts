import { setupI18n } from "@lingui/core";
import { messages as en } from "../locales/en/messages.po";
import { messages as zhCN } from "../locales/zh-CN/messages.po";

export const i18n = setupI18n({ locale: "en", messages: { en, "zh-CN": zhCN } });

export const uiMessages = {
  brandTagline: /*i18n*/ {
    id: "brandTagline",
    message: "Select a region · Translate what matters",
  },
  settingsTitle: /*i18n*/ { id: "settingsTitle", message: "LingoFrame settings" },
  settingsSubtitle: /*i18n*/ {
    id: "settingsSubtitle",
    message: "Choose where translations come from and which language they should use.",
  },
  interfaceLanguage: /*i18n*/ { id: "interfaceLanguage", message: "Interface language" },
  followBrowser: /*i18n*/ { id: "followBrowser", message: "Follow browser" },
  loadingSettings: /*i18n*/ { id: "loadingSettings", message: "Loading settings…" },
  behaviorTitle: /*i18n*/ { id: "behaviorTitle", message: "Translation behavior" },
  behaviorSubtitle: /*i18n*/ {
    id: "behaviorSubtitle",
    message: "Choose the target language and how translations should read.",
  },
  targetLanguage: /*i18n*/ { id: "targetLanguage", message: "Target language" },
  chooseLanguage: /*i18n*/ { id: "chooseLanguage", message: "Choose or search a language" },
  customLanguage: /*i18n*/ { id: "customLanguage", message: "Use custom language: {name}" },
  openLanguages: /*i18n*/ { id: "openLanguages", message: "Show languages" },
  instructions: /*i18n*/ { id: "instructions", message: "Translation instructions" },
  instructionsDescription: /*i18n*/ {
    id: "instructionsDescription",
    message: "Set terminology, tone, audience, and writing style.",
  },
  defaultMode: /*i18n*/ { id: "defaultMode", message: "Built-in default" },
  defaultDescription: /*i18n*/ {
    id: "defaultDescription",
    message: "Use the recommended translation preferences.",
  },
  customMode: /*i18n*/ { id: "customMode", message: "Custom" },
  customDescription: /*i18n*/ {
    id: "customDescription",
    message: "Use your own translation preferences.",
  },
  viewInstructions: /*i18n*/ { id: "viewInstructions", message: "View built-in instructions" },
  customInstructions: /*i18n*/ {
    id: "customInstructions",
    message: "Custom translation instructions",
  },
  resetInstructions: /*i18n*/ { id: "resetInstructions", message: "Use built-in default" },
  providerTitle: /*i18n*/ { id: "providerTitle", message: "Translation provider" },
  providerSubtitle: /*i18n*/ {
    id: "providerSubtitle",
    message: "Choose the service and model used for translation.",
  },
  provider: /*i18n*/ { id: "provider", message: "Provider" },
  compatible: /*i18n*/ { id: "compatible", message: "OpenAI-compatible" },
  baseUrl: /*i18n*/ { id: "baseUrl", message: "API base URL" },
  baseUrlHint: /*i18n*/ { id: "baseUrlHint", message: "Use HTTPS, or HTTP for a local service." },
  model: /*i18n*/ { id: "model", message: "Model" },
  apiKey: /*i18n*/ { id: "apiKey", message: "API key" },
  keyHint: /*i18n*/ {
    id: "keyHint",
    message: "Stored in this browser profile and used only with your chosen provider.",
  },
  showKey: /*i18n*/ { id: "showKey", message: "Show" },
  hideKey: /*i18n*/ { id: "hideKey", message: "Hide" },
  save: /*i18n*/ { id: "save", message: "Save settings" },
  saving: /*i18n*/ { id: "saving", message: "Saving…" },
  saved: /*i18n*/ { id: "saved", message: "Settings saved" },
  test: /*i18n*/ { id: "test", message: "Test configuration" },
  testing: /*i18n*/ { id: "testing", message: "Testing…" },
  tested: /*i18n*/ {
    id: "tested",
    message: "Configuration test succeeded. Settings have not been saved.",
  },
  privacy: /*i18n*/ {
    id: "privacy",
    message: "Text in the region you select is sent to your chosen provider.",
  },
  required: /*i18n*/ { id: "required", message: "Enter a value for this field." },
  invalidUrl: /*i18n*/ {
    id: "invalidUrl",
    message: "Enter an HTTPS API URL, or a loopback HTTP URL.",
  },
  missingApiKey: /*i18n*/ {
    id: "missingApiKey",
    message: "Enter an API key in LingoFrame settings.",
  },
  invalidResponse: /*i18n*/ {
    id: "invalidResponse",
    message:
      "The provider returned an incomplete or unreadable translation. Try again or choose another model.",
  },
  invalidSession: /*i18n*/ {
    id: "invalidSession",
    message: "This translation could not be started. Select the region again.",
  },
  httpError: /*i18n*/ {
    id: "httpError",
    message:
      "The provider returned HTTP {status}. Check the endpoint, credentials, and service limits.",
  },
  networkError: /*i18n*/ {
    id: "networkError",
    message: "Could not reach the provider. Check the endpoint and your connection.",
  },
  timeout: /*i18n*/ {
    id: "timeout",
    message: "The translation request timed out. Please try again.",
  },
  connectionClosed: /*i18n*/ {
    id: "connectionClosed",
    message: "The translation connection closed. Select the region to try again.",
  },
  permissionDenied: /*i18n*/ {
    id: "permissionDenied",
    message: "Allow access to this API endpoint to use the provider.",
  },
  settingsError: /*i18n*/ {
    id: "settingsError",
    message: "Could not load or save settings. Please try again.",
  },
  unknownError: /*i18n*/ { id: "unknownError", message: "Something went wrong. Please try again." },
  pickerTitle: /*i18n*/ { id: "pickerTitle", message: "LingoFrame region picker" },
  pickerHint: /*i18n*/ { id: "pickerHint", message: "Click a region to translate · Esc to cancel" },
  noText: /*i18n*/ { id: "noText", message: "No readable text found in this region" },
  translating: /*i18n*/ { id: "translating", message: "Translating" },
  actionTitle: /*i18n*/ { id: "actionTitle", message: "Select a region to translate" },
  pageUnavailable: /*i18n*/ {
    id: "pageUnavailable",
    message: "LingoFrame cannot access this page",
  },
  extensionDescription: /*i18n*/ {
    id: "extensionDescription",
    message: "Select a region. Translate what matters.",
  },
} as const;
