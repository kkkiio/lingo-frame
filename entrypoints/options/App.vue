<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { browser } from "wxt/browser";
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  SelectRoot,
  SelectTrigger,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from "reka-ui";
import {
  DEFAULT_SETTINGS,
  getEndpointPermission,
  readSettings,
  settingsSchema,
  writeSettings,
  type Settings,
} from "../../src/shared/settings";
import { TARGET_LANGUAGES } from "../../src/shared/languages";
import { i18n, uiMessages } from "../../src/shared/i18n";
import { TranslationError, type TranslationFailure } from "../../src/shared/errors";
import {
  readUiPreferences,
  uiPreferenceSchema,
  type UiPreference,
} from "../../src/shared/ui-preferences";
import { DEFAULT_TRANSLATION_INSTRUCTIONS } from "../../src/translation/prompt";
import type { TranslationResponse } from "../../src/shared/messages";

const settings = ref<Settings>(structuredClone(DEFAULT_SETTINGS));
const loading = ref(true);
const operation = ref<"save" | "test" | null>(null);
const revealKey = ref(false);
const locale = ref(i18n.locale);
const preference = ref<UiPreference>("auto");
const localeBusy = ref(false);
const search = ref("");
const languageOpen = ref(false);
const fieldErrors = ref<Record<string, "required" | "invalidUrl">>({});
const notice = ref<{ success: "saved" | "tested" } | { failure: TranslationFailure } | null>(null);
const activeProvider = computed(() => settings.value.providers[settings.value.provider]);
const copy = computed(() => {
  locale.value;
  return Object.fromEntries(
    Object.entries(uiMessages).map(([key, message]) => [key, i18n._(message)]),
  ) as Record<keyof typeof uiMessages, string>;
});
const noticeText = computed(() => {
  locale.value;
  if (!notice.value) return "";
  if ("success" in notice.value) return copy.value[notice.value.success];
  return i18n._(uiMessages[notice.value.failure.code].id, {
    status: notice.value.failure.status ?? "",
  });
});
const languageOptions = computed(() =>
  TARGET_LANGUAGES.map((language) => ({
    ...language,
    label: locale.value === "zh-CN" ? language.chinese : language.english,
  })).filter((language) =>
    [language.english, language.native, language.chinese, language.code].some((name) =>
      name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
    ),
  ),
);
const selectedLanguage = computed({
  get: () =>
    settings.value.targetLanguage.kind === "preset"
      ? settings.value.targetLanguage.code
      : `custom:${settings.value.targetLanguage.name}`,
  set: (value: string) => {
    const language = TARGET_LANGUAGES.find(({ code }) => code === value);
    settings.value.targetLanguage = language
      ? { kind: "preset", code: language.code }
      : { kind: "custom", name: value.slice("custom:".length) };
    search.value = "";
  },
});
const languageLabel = computed(() => {
  const target = settings.value.targetLanguage;
  if (target.kind === "custom") return target.name;
  const language = TARGET_LANGUAGES.find(({ code }) => code === target.code)!;
  return locale.value === "zh-CN" ? language.chinese : language.english;
});
const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
  changes,
  area,
) => {
  if (area === "local" && changes.uiPreferences) {
    void readUiPreferences().then((ui) => {
      preference.value = ui.preference;
      i18n.activate(ui.locale);
    });
  }
};
const unsubscribe = i18n.on("change", () => {
  locale.value = i18n.locale;
  document.documentElement.lang = i18n.locale;
  document.title = i18n._(uiMessages.settingsTitle);
});
onUnmounted(() => {
  unsubscribe();
  browser.storage.onChanged.removeListener(onStorageChanged);
});

onMounted(async () => {
  try {
    const ui = await readUiPreferences();
    preference.value = ui.preference;
    i18n.activate(ui.locale);
    browser.storage.onChanged.addListener(onStorageChanged);
    settings.value = await readSettings();
    if (!settings.value.translationInstructions.customText) {
      settings.value.translationInstructions.customText = DEFAULT_TRANSLATION_INSTRUCTIONS;
    }
  } catch {
    notice.value = { failure: { code: "settingsError" } };
  } finally {
    loading.value = false;
  }
});

async function changeInterfaceLanguage(value: unknown): Promise<void> {
  const previous = preference.value;
  const next = uiPreferenceSchema.parse(value);
  localeBusy.value = true;
  preference.value = next;
  const detected = /^zh(?:-|_|$)/i.test(browser.i18n.getUILanguage()) ? "zh-CN" : "en";
  i18n.activate(next === "auto" ? detected : next);
  try {
    await browser.storage.local.set({ uiPreferences: { locale: next } });
  } catch {
    preference.value = previous;
    i18n.activate(previous === "auto" ? detected : previous);
    notice.value = { failure: { code: "settingsError" } };
  } finally {
    localeBusy.value = false;
  }
}

async function submit(kind: "save" | "test"): Promise<void> {
  if (operation.value) return;
  fieldErrors.value = {};
  notice.value = null;
  const result = settingsSchema.safeParse(settings.value);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.at(-1) as string;
      fieldErrors.value[field] = field === "baseUrl" ? "invalidUrl" : "required";
    }
  }
  if (kind === "test" && !activeProvider.value.apiKey.trim()) fieldErrors.value.apiKey = "required";
  if (Object.keys(fieldErrors.value).length > 0) {
    await nextTick();
    document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    return;
  }
  if (!result.success) return;
  operation.value = kind;
  try {
    const origin = getEndpointPermission(result.data.providers[result.data.provider].baseUrl);
    if (
      !(await browser.permissions.contains({ origins: [origin] })) &&
      !(await browser.permissions.request({ origins: [origin] }))
    ) {
      throw new TranslationError({ code: "permissionDenied" });
    }
    if (kind === "save") {
      try {
        await writeSettings(result.data);
      } catch {
        throw new TranslationError({ code: "settingsError" });
      }
    } else {
      const response: TranslationResponse = await browser.runtime.sendMessage({
        type: "TEST_PROVIDER",
        settings: result.data,
      });
      if (!response.ok) throw new TranslationError(response.error);
    }
    notice.value = { success: kind === "save" ? "saved" : "tested" };
  } catch (error) {
    notice.value = { failure: TranslationError.describe(error) };
  } finally {
    operation.value = null;
  }
}
</script>

<template>
  <main class="settings-shell">
    <header class="hero">
      <div class="mark" aria-hidden="true">LF</div>
      <p class="eyebrow">{{ copy.brandTagline }}</p>
      <SelectRoot
        :model-value="preference"
        :disabled="localeBusy || loading"
        @update:model-value="changeInterfaceLanguage"
      >
        <SelectTrigger class="interface-language-trigger" :aria-label="copy.interfaceLanguage">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18M5 6.5h14M5 17.5h14" />
          </svg>
          <span>{{ locale === "zh-CN" ? "简体中文" : "English" }}</span>
          <svg
            class="language-chevron"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </SelectTrigger>
        <SelectPortal>
          <SelectContent
            class="interface-language-menu"
            position="popper"
            side="bottom"
            align="end"
            :side-offset="8"
          >
            <SelectViewport>
              <SelectItem
                v-for="item in [
                  { value: 'auto', label: copy.followBrowser },
                  { value: 'en', label: 'English' },
                  { value: 'zh-CN', label: '简体中文' },
                ]"
                :key="item.value"
                :value="item.value"
                class="interface-language-option"
              >
                <SelectItemText>{{ item.label }}</SelectItemText>
                <SelectItemIndicator>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    aria-hidden="true"
                  >
                    <path d="m3 8 3 3 7-7" />
                  </svg>
                </SelectItemIndicator>
              </SelectItem>
            </SelectViewport>
          </SelectContent>
        </SelectPortal>
      </SelectRoot>
      <h1>{{ copy.settingsTitle }}</h1>
      <p class="hero-subtitle">{{ copy.settingsSubtitle }}</p>
    </header>
    <section v-if="loading" class="card loading-card">{{ copy.loadingSettings }}</section>
    <form v-else class="settings-form" novalidate @submit.prevent="submit('save')">
      <fieldset :disabled="operation !== null">
        <section class="card">
          <div class="card-heading">
            <h2>{{ copy.behaviorTitle }}</h2>
            <p>{{ copy.behaviorSubtitle }}</p>
          </div>
          <div class="language-field">
            <label id="target-language-label" for="target-language">{{
              copy.targetLanguage
            }}</label>
            <ComboboxRoot
              v-model="selectedLanguage"
              v-model:open="languageOpen"
              :disabled="operation !== null"
              ignore-filter
              @update:open="!$event && (search = '')"
            >
              <ComboboxAnchor class="language-anchor">
                <ComboboxInput
                  id="target-language"
                  :key="locale"
                  :display-value="() => languageLabel"
                  :placeholder="copy.chooseLanguage"
                  aria-labelledby="target-language-label"
                  @input="search = ($event.target as HTMLInputElement).value"
                />
                <ComboboxTrigger :aria-label="copy.openLanguages">▾</ComboboxTrigger>
              </ComboboxAnchor>
              <ComboboxContent class="language-menu" position="popper" :side-offset="6">
                <ComboboxViewport>
                  <ComboboxItem
                    v-for="language in languageOptions"
                    :key="language.code"
                    :value="language.code"
                    :text-value="language.label"
                    class="language-option"
                  >
                    <span>{{ language.label }}</span
                    ><small v-if="language.native !== language.label">{{ language.native }}</small>
                  </ComboboxItem>
                  <ComboboxItem
                    v-if="
                      search.trim() &&
                      !TARGET_LANGUAGES.some((language) =>
                        [language.english, language.native, language.chinese, language.code].some(
                          (name) => name.toLowerCase() === search.trim().toLowerCase(),
                        ),
                      )
                    "
                    :value="`custom:${search.trim()}`"
                    class="language-option"
                  >
                    {{ i18n._(uiMessages.customLanguage.id, { name: search.trim() }) }}
                  </ComboboxItem>
                </ComboboxViewport>
              </ComboboxContent>
            </ComboboxRoot>
          </div>
          <div class="instructions-field" role="group" aria-labelledby="instructions-label">
            <div id="instructions-label" class="field-title">{{ copy.instructions }}</div>
            <p class="field-description">{{ copy.instructionsDescription }}</p>
            <div class="instruction-modes">
              <label class="mode-option"
                ><input
                  v-model="settings.translationInstructions.mode"
                  type="radio"
                  name="instruction-mode"
                  value="default"
                /><span
                  ><strong>{{ copy.defaultMode }}</strong
                  ><small>{{ copy.defaultDescription }}</small></span
                ></label
              >
              <label class="mode-option"
                ><input
                  v-model="settings.translationInstructions.mode"
                  type="radio"
                  name="instruction-mode"
                  value="custom"
                /><span
                  ><strong>{{ copy.customMode }}</strong
                  ><small>{{ copy.customDescription }}</small></span
                ></label
              >
            </div>
            <details
              v-if="settings.translationInstructions.mode === 'default'"
              class="instructions-preview"
            >
              <summary>{{ copy.viewInstructions }}</summary>
              <pre>{{ DEFAULT_TRANSLATION_INSTRUCTIONS }}</pre>
            </details>
            <div v-else class="custom-instructions">
              <textarea
                v-model="settings.translationInstructions.customText"
                :aria-label="copy.customInstructions"
                :aria-invalid="Boolean(fieldErrors.customText)"
                :aria-describedby="fieldErrors.customText ? 'instructions-error' : undefined"
                @input="delete fieldErrors.customText"
              />
              <small v-if="fieldErrors.customText" id="instructions-error" class="field-error">{{
                copy.required
              }}</small>
              <button
                class="reset"
                type="button"
                @click="settings.translationInstructions.mode = 'default'"
              >
                {{ copy.resetInstructions }}
              </button>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-heading">
            <h2>{{ copy.providerTitle }}</h2>
            <p>{{ copy.providerSubtitle }}</p>
          </div>
          <label
            ><span>{{ copy.provider }}</span
            ><select
              v-model="settings.provider"
              @change="
                fieldErrors = {};
                revealKey = false;
              "
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai-compatible">{{ copy.compatible }}</option>
            </select></label
          >
          <label
            ><span>{{ copy.baseUrl }}</span
            ><input
              v-model.trim="activeProvider.baseUrl"
              :aria-label="copy.baseUrl"
              type="url"
              spellcheck="false"
              :aria-invalid="Boolean(fieldErrors.baseUrl)"
              aria-describedby="url-hint"
              @input="delete fieldErrors.baseUrl"
            /><small id="url-hint" :class="{ 'field-error': fieldErrors.baseUrl }">{{
              fieldErrors.baseUrl ? copy.invalidUrl : copy.baseUrlHint
            }}</small></label
          >
          <label
            ><span>{{ copy.model }}</span
            ><input
              v-model.trim="activeProvider.model"
              :aria-label="copy.model"
              type="text"
              spellcheck="false"
              :aria-invalid="Boolean(fieldErrors.model)"
              :aria-describedby="fieldErrors.model ? 'model-error' : undefined"
              @input="delete fieldErrors.model"
            /><small v-if="fieldErrors.model" id="model-error" class="field-error">{{
              copy.required
            }}</small></label
          >
          <label
            ><span>{{ copy.apiKey }}</span>
            <div class="secret-field">
              <input
                v-model="activeProvider.apiKey"
                :aria-label="copy.apiKey"
                :type="revealKey ? 'text' : 'password'"
                autocomplete="off"
                :aria-invalid="Boolean(fieldErrors.apiKey)"
                aria-describedby="key-hint"
                @input="delete fieldErrors.apiKey"
              /><button class="reveal" type="button" @click="revealKey = !revealKey">
                {{ revealKey ? copy.hideKey : copy.showKey }}
              </button>
            </div>
            <small id="key-hint" :class="{ 'field-error': fieldErrors.apiKey }">{{
              fieldErrors.apiKey ? copy.required : copy.keyHint
            }}</small></label
          >
        </section>
        <footer class="actions">
          <button
            class="secondary"
            type="button"
            :disabled="operation !== null"
            @click="submit('test')"
          >
            {{ operation === "test" ? copy.testing : copy.test }}</button
          ><button class="primary" type="submit" :disabled="operation !== null">
            {{ operation === "save" ? copy.saving : copy.save }}
          </button>
        </footer>
      </fieldset>
    </form>
    <div
      v-if="notice"
      class="notice"
      :class="'failure' in notice ? 'error' : 'success'"
      role="status"
    >
      {{ noticeText }}
    </div>
    <p class="privacy-note">{{ copy.privacy }}</p>
  </main>
</template>
