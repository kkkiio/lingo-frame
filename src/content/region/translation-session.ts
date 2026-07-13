/*
 * Derived from FluentRead entrypoints/main/trans.ts.
 * Upstream commit: ab1be13b31b9aaa874eb7e7d5ac652d722ba649a.
 * Modified by LingoFrame contributors, 2026-07-13.
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { browser } from "wxt/browser";
import type { LLMSessionUnit, TranslationResponse } from "../../shared/messages";
import type { RegionTranslationUnit } from "./scan-region";

interface TranslationTask {
  unit: RegionTranslationUnit;
  slot: HTMLSpanElement;
}

export class RegionTranslationSession {
  private readonly sessionId = crypto.randomUUID();
  private readonly tasks: TranslationTask[];
  private readonly sessionUnits: LLMSessionUnit[];
  private activeRequestId: string | null = null;
  private cancelled = false;

  constructor(units: RegionTranslationUnit[]) {
    this.tasks = units.map((unit) => ({ unit, slot: document.createElement("span") }));
    this.sessionUnits = units.map(({ id, role, text }) => ({ id, role, text }));
  }

  async run(): Promise<void> {
    for (const task of this.tasks) {
      task.unit.element.setAttribute("data-lingo-frame-session", this.sessionId);
      task.slot.className = "lingo-frame-translation-slot";
      task.slot.setAttribute("data-lingo-frame-ui", "");
      task.slot.setAttribute("data-lingo-frame-unit", task.unit.id);
      task.unit.slot.parent.insertBefore(task.slot, task.unit.slot.before);
    }

    if (this.cancelled) {
      return;
    }

    await this.translateRegion();
  }

  cancel(): void {
    this.cancelled = true;
    if (this.activeRequestId) {
      void browser.runtime.sendMessage({
        type: "CANCEL_TRANSLATION",
        requestId: this.activeRequestId,
      });
    }
    this.activeRequestId = null;
    for (const task of this.tasks) {
      task.slot.querySelectorAll(".lingo-frame-loading").forEach((node) => node.remove());
      if (!task.slot.classList.contains("lingo-frame-bilingual-content")) {
        task.slot.remove();
      }
    }
  }

  private async translateRegion(): Promise<void> {
    const requestId = this.sessionId;
    this.activeRequestId = requestId;
    for (const task of this.tasks) {
      task.slot.classList.remove("lingo-frame-bilingual-content");
      task.slot.replaceChildren();
      const loading = document.createElement("span");
      loading.className = "lingo-frame-loading";
      loading.setAttribute("data-lingo-frame-ui", "");
      loading.setAttribute("aria-label", "Translating");
      task.slot.appendChild(loading);
    }

    try {
      const response = await browser.runtime.sendMessage({
        type: "TRANSLATE_REGION",
        requestId,
        units: this.sessionUnits,
      }) as TranslationResponse;

      if (this.cancelled) {
        return;
      }
      if (!response.ok) {
        for (const task of this.tasks) {
          this.renderFailure(task, response.error);
        }
        return;
      }

      const translations = new Map(response.translations.map(({ id, text }) => [id, text]));
      for (const task of this.tasks) {
        const text = translations.get(task.unit.id);
        if (!text) {
          this.renderFailure(task, "Translation response omitted this content block");
          continue;
        }
        task.slot.classList.add("lingo-frame-bilingual-content");
        task.slot.textContent = text;
        task.unit.element.classList.add("lingo-frame-bilingual");
        task.unit.element.setAttribute("data-lingo-frame-translated", "true");
      }
    } catch (error) {
      if (!this.cancelled) {
        const message = error instanceof Error ? error.message : "Translation failed";
        for (const task of this.tasks) {
          this.renderFailure(task, message);
        }
      }
    } finally {
      if (this.activeRequestId === requestId) {
        this.activeRequestId = null;
      }
    }
  }

  private renderFailure(task: TranslationTask, message: string): void {
    task.slot.classList.remove("lingo-frame-bilingual-content");
    task.slot.replaceChildren();
    const failure = document.createElement("span");
    failure.className = "lingo-frame-failure";
    failure.setAttribute("data-lingo-frame-ui", "");
    const text = document.createElement("span");
    text.textContent = message;
    failure.appendChild(text);
    task.slot.appendChild(failure);
  }
}
