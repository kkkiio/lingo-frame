<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { browser } from "wxt/browser";
import type { TranslationResponse } from "../../src/shared/messages";
import {
  DEFAULT_SETTINGS,
  getEndpointPermission,
  readSettings,
  settingsSchema,
  writeSettings,
  type Settings,
} from "../../src/shared/settings";

const settings = ref<Settings>(structuredClone(DEFAULT_SETTINGS));
const loading = ref(true);
const busy = ref(false);
const revealKey = ref(false);
const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);

const activeProvider = computed(() => settings.value.providers[settings.value.provider]);
const providerDescription = computed(() => {
  return settings.value.provider === "deepseek"
    ? "DeepSeek uses its OpenAI-compatible chat completions endpoint."
    : "Use any service that implements the OpenAI chat completions API.";
});

onMounted(async () => {
  try {
    settings.value = await readSettings();
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : "Could not load settings",
    };
  } finally {
    loading.value = false;
  }
});

async function requestEndpointAccess(): Promise<boolean> {
  const origin = getEndpointPermission(activeProvider.value.baseUrl);
  const alreadyGranted = await browser.permissions.contains({ origins: [origin] });

  if (alreadyGranted) {
    return true;
  }

  return browser.permissions.request({ origins: [origin] });
}

async function save(): Promise<void> {
  busy.value = true;
  notice.value = null;

  try {
    const parsed = settingsSchema.parse(settings.value);
    if (!(await requestEndpointAccess())) {
      throw new Error("LingoFrame needs access to this API endpoint to translate text.");
    }
    await writeSettings(parsed);
    notice.value = { kind: "success", text: "Settings saved" };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : "Could not save settings",
    };
  } finally {
    busy.value = false;
  }
}

async function testProvider(): Promise<void> {
  busy.value = true;
  notice.value = null;

  try {
    const parsed = settingsSchema.parse(settings.value);
    if (!(await requestEndpointAccess())) {
      throw new Error("LingoFrame needs access to this API endpoint before testing it.");
    }
    const response = await browser.runtime.sendMessage({
      type: "TEST_PROVIDER",
      settings: parsed,
    }) as TranslationResponse | { ok: true };
    if (!response.ok) {
      throw new Error(response.error);
    }
    notice.value = { kind: "success", text: "Provider connection succeeded" };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : "Provider test failed",
    };
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="settings-shell">
    <header class="hero">
      <div class="mark" aria-hidden="true">LF</div>
      <div>
        <p class="eyebrow">SELECT A REGION · TRANSLATE WHAT MATTERS</p>
        <h1>LingoFrame settings</h1>
        <p>Choose where translations come from and which language they should use.</p>
      </div>
    </header>

    <section v-if="loading" class="card loading-card">Loading settings…</section>

    <form v-else class="card" @submit.prevent="save">
      <div class="field-grid">
        <label>
          <span>Translation provider</span>
          <select v-model="settings.provider">
            <option value="deepseek">DeepSeek</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>
          <small>{{ providerDescription }}</small>
        </label>

        <label>
          <span>Target language</span>
          <input
            v-model.trim="settings.targetLanguage"
            list="target-language-options"
            type="text"
            required
            placeholder="Simplified Chinese"
          />
          <datalist id="target-language-options">
            <option value="Simplified Chinese" />
            <option value="Traditional Chinese" />
            <option value="English" />
            <option value="Japanese" />
            <option value="Korean" />
            <option value="French" />
            <option value="German" />
            <option value="Spanish" />
          </datalist>
          <small>Choose a suggestion or enter any language understood by the provider.</small>
        </label>
      </div>

      <label>
        <span>API base URL</span>
        <input v-model.trim="activeProvider.baseUrl" type="url" required spellcheck="false" />
        <small>Use HTTPS. Plain HTTP is accepted only for localhost loopback services.</small>
      </label>

      <label>
        <span>Model</span>
        <input v-model.trim="activeProvider.model" type="text" required spellcheck="false" />
      </label>

      <label>
        <span>API key</span>
        <div class="secret-field">
          <input
            v-model="activeProvider.apiKey"
            :type="revealKey ? 'text' : 'password'"
            autocomplete="off"
            placeholder="Stored only in this browser profile"
          />
          <button class="reveal" type="button" @click="revealKey = !revealKey">
            {{ revealKey ? "Hide" : "Show" }}
          </button>
        </div>
        <small>The key stays in Chrome extension storage and is never exposed to page scripts.</small>
      </label>

      <div v-if="notice" class="notice" :class="notice.kind" role="status">
        {{ notice.text }}
      </div>

      <footer class="actions">
        <button class="secondary" type="button" :disabled="busy" @click="testProvider">
          Test connection
        </button>
        <button class="primary" type="submit" :disabled="busy">
          {{ busy ? "Working…" : "Save settings" }}
        </button>
      </footer>
    </form>

    <p class="privacy-note">
      LingoFrame sends only the text from regions you explicitly select to the configured provider.
    </p>
  </main>
</template>
