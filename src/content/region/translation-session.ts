/*
 * Derived from FluentRead entrypoints/main/trans.ts.
 * Upstream commit: ab1be13b31b9aaa874eb7e7d5ac652d722ba649a.
 * Modified by LingoFrame contributors, 2026-08-09.
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { browser } from "wxt/browser";
import {
  TRANSLATION_SESSION_PORT,
  type TranslationChunk,
  type TranslationSegment,
  type TranslationSessionCommand,
  type TranslationSessionEvent,
} from "../../shared/messages";
import type { RegionTranslationUnit } from "./scan-region";

const FIRST_CHUNK_MIN_ESTIMATED_TOKENS = 200;
const FIRST_CHUNK_TARGET_ESTIMATED_TOKENS = 300;
const FIRST_CHUNK_MAX_ESTIMATED_TOKENS = 400;
const NEXT_CHUNK_MIN_ESTIMATED_TOKENS = 500;
const NEXT_CHUNK_TARGET_ESTIMATED_TOKENS = 750;
const NEXT_CHUNK_MAX_ESTIMATED_TOKENS = 1_000;
const HARD_MAX_ESTIMATED_TOKENS = 1_500;
const MAX_SEGMENTS_PER_CHUNK = 16;
const UTF8_BYTES_PER_ESTIMATED_TOKEN = 3;

interface TaskSegment {
  id: string;
  separatorBefore: string;
  translatedText: string | null;
}

interface TranslationTask {
  unit: RegionTranslationUnit;
  slot: HTMLSpanElement;
  segments: TaskSegment[];
}

export class RegionTranslationSession {
  private readonly sessionId = crypto.randomUUID();
  private readonly tasks: TranslationTask[];
  private readonly chunks: TranslationChunk[];
  private readonly tasksBySegmentId = new Map<string, TranslationTask>();
  private port: ReturnType<typeof browser.runtime.connect> | null = null;
  private resolveRun: (() => void) | null = null;
  private cancelled = false;
  private settled = false;

  constructor(units: RegionTranslationUnit[]) {
    this.tasks = units.map((unit) => ({
      unit,
      slot: document.createElement("span"),
      segments: [],
    }));

    const chunks: TranslationChunk[] = [];
    let currentSegments: TranslationSegment[] = [];
    let currentEstimatedTokens = 0;
    const textEncoder = new TextEncoder();
    for (const task of this.tasks) {
      const parts = task.unit.text.split(/(\r?\n[^\S\r\n]*\r?\n+)/);
      let segmentIndex = 0;
      for (let partIndex = 0; partIndex < parts.length; partIndex += 2) {
        const text = parts[partIndex]?.trim() ?? "";
        if (!text) {
          continue;
        }

        const prefersBreakBefore = segmentIndex > 0 || (
          segmentIndex === 0 && task.unit.startsChunk
        );
        const estimatedTokens = Math.max(
          1,
          Math.ceil(textEncoder.encode(text).byteLength / UTF8_BYTES_PER_ESTIMATED_TOKEN),
        );
        const isFirstChunk = chunks.length === 0;
        const minimumTokens = isFirstChunk
          ? FIRST_CHUNK_MIN_ESTIMATED_TOKENS
          : NEXT_CHUNK_MIN_ESTIMATED_TOKENS;
        const targetTokens = isFirstChunk
          ? FIRST_CHUNK_TARGET_ESTIMATED_TOKENS
          : NEXT_CHUNK_TARGET_ESTIMATED_TOKENS;
        const maximumTokens = isFirstChunk
          ? FIRST_CHUNK_MAX_ESTIMATED_TOKENS
          : NEXT_CHUNK_MAX_ESTIMATED_TOKENS;
        const hasCurrentSegments = currentSegments.length > 0;
        const reachedPreferredBoundary = prefersBreakBefore &&
          currentEstimatedTokens >= minimumTokens;
        const reachedTarget = currentEstimatedTokens >= targetTokens;
        const wouldExceedSoftMaximum = currentEstimatedTokens >= minimumTokens &&
          currentEstimatedTokens + estimatedTokens > maximumTokens;
        const wouldExceedHardMaximum = estimatedTokens <= HARD_MAX_ESTIMATED_TOKENS &&
          currentEstimatedTokens + estimatedTokens > HARD_MAX_ESTIMATED_TOKENS;
        const reachedSegmentLimit = currentSegments.length >= MAX_SEGMENTS_PER_CHUNK;
        if (hasCurrentSegments && (
          reachedPreferredBoundary ||
          reachedTarget ||
          wouldExceedSoftMaximum ||
          wouldExceedHardMaximum ||
          reachedSegmentLimit
        )) {
          chunks.push({ id: `chunk-${chunks.length}`, segments: currentSegments });
          currentSegments = [];
          currentEstimatedTokens = 0;
        }

        const id = `${task.unit.id}:segment-${segmentIndex}`;
        const segment: TranslationSegment = {
          id,
          unitId: task.unit.id,
          role: task.unit.role,
          text,
        };
        task.segments.push({
          id,
          separatorBefore: segmentIndex === 0 ? "" : parts[partIndex - 1] ?? "\n\n",
          translatedText: null,
        });
        this.tasksBySegmentId.set(id, task);
        currentSegments.push(segment);
        currentEstimatedTokens += estimatedTokens;
        segmentIndex += 1;
      }
    }
    if (currentSegments.length > 0) {
      chunks.push({ id: `chunk-${chunks.length}`, segments: currentSegments });
    }
    this.chunks = chunks;
  }

  async run(): Promise<void> {
    for (const task of this.tasks) {
      task.unit.element.setAttribute("data-lingo-frame-session", this.sessionId);
      task.slot.className = "lingo-frame-translation-slot";
      task.slot.setAttribute("data-lingo-frame-ui", "");
      task.slot.setAttribute("data-lingo-frame-unit", task.unit.id);
      task.unit.slot.parent.insertBefore(task.slot, task.unit.slot.before);
      this.renderTaskProgress(task);
    }

    if (this.cancelled || this.chunks.length === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.resolveRun = resolve;
      const port = browser.runtime.connect({ name: TRANSLATION_SESSION_PORT });
      this.port = port;
      port.onMessage.addListener((message: unknown) => {
        this.handleSessionEvent(message as TranslationSessionEvent);
      });
      port.onDisconnect.addListener(() => {
        if (!this.cancelled && !this.settled) {
          this.renderSessionFailure("Translation connection closed before completion");
        }
        this.finishRun(false);
      });
      const command: TranslationSessionCommand = {
        type: "START_TRANSLATION_SESSION",
        sessionId: this.sessionId,
        chunks: this.chunks,
      };
      port.postMessage(command);
    });
  }

  cancel(): void {
    this.cancelled = true;
    const port = this.port;
    if (port) {
      const command: TranslationSessionCommand = {
        type: "CANCEL_TRANSLATION_SESSION",
        sessionId: this.sessionId,
      };
      port.postMessage(command);
      this.port = null;
      port.disconnect();
    }
    this.finishRun(false);

    for (const task of this.tasks) {
      task.slot.querySelectorAll(".lingo-frame-loading").forEach((node) => node.remove());
      if (!task.slot.classList.contains("lingo-frame-bilingual-content")) {
        task.slot.remove();
      }
    }
  }

  private handleSessionEvent(event: TranslationSessionEvent): void {
    if (this.cancelled || this.settled || event.sessionId !== this.sessionId) {
      return;
    }

    if (event.type === "TRANSLATION_CHUNK_COMPLETED") {
      const touchedTasks = new Set<TranslationTask>();
      for (const translation of event.translations) {
        const task = this.tasksBySegmentId.get(translation.id);
        const segment = task?.segments.find(({ id }) => id === translation.id);
        if (!task || !segment || segment.translatedText !== null || !translation.text.trim()) {
          this.renderSessionFailure("Translation response contained an invalid Segment ID");
          this.finishRun(true);
          return;
        }
        segment.translatedText = translation.text.trim();
        touchedTasks.add(task);
      }
      for (const task of touchedTasks) {
        this.renderTaskProgress(task);
      }
      return;
    }

    if (event.type === "TRANSLATION_SESSION_FAILED") {
      this.renderSessionFailure(event.error);
      this.finishRun(true);
      return;
    }

    for (const task of this.tasks) {
      if (task.segments.some(({ translatedText }) => translatedText === null)) {
        this.renderSessionFailure("Translation response omitted part of this Region");
        this.finishRun(true);
        return;
      }
    }
    this.finishRun(true);
  }

  private renderTaskProgress(task: TranslationTask): void {
    const translatedSegments = task.segments.filter(({ translatedText }) => translatedText !== null);
    const isComplete = translatedSegments.length === task.segments.length && task.segments.length > 0;
    task.slot.replaceChildren();

    if (translatedSegments.length > 0) {
      const text = task.segments
        .filter(({ translatedText }) => translatedText !== null)
        .map(({ separatorBefore, translatedText }) => `${separatorBefore}${translatedText}`)
        .join("");
      task.slot.classList.add("lingo-frame-bilingual-content");
      task.slot.append(document.createTextNode(text));
      task.unit.element.classList.add("lingo-frame-bilingual");
    } else {
      task.slot.classList.remove("lingo-frame-bilingual-content");
    }

    if (!isComplete) {
      const loading = document.createElement("span");
      loading.className = "lingo-frame-loading";
      loading.setAttribute("data-lingo-frame-ui", "");
      loading.setAttribute("aria-label", "Translating");
      task.slot.appendChild(loading);
      return;
    }

    const elementTasks = this.tasks.filter(({ unit }) => unit.element === task.unit.element);
    if (elementTasks.every((elementTask) => (
      elementTask.segments.every(({ translatedText }) => translatedText !== null)
    ))) {
      task.unit.element.setAttribute("data-lingo-frame-translated", "true");
    }
  }

  private renderSessionFailure(message: string): void {
    for (const task of this.tasks) {
      const isComplete = task.segments.every(({ translatedText }) => translatedText !== null);
      if (isComplete) {
        continue;
      }

      task.slot.querySelectorAll(".lingo-frame-loading, .lingo-frame-failure")
        .forEach((node) => node.remove());
      const failure = document.createElement("span");
      failure.className = "lingo-frame-failure";
      failure.setAttribute("data-lingo-frame-ui", "");
      const text = document.createElement("span");
      text.textContent = message;
      failure.appendChild(text);
      task.slot.appendChild(failure);
    }
  }

  private finishRun(disconnect: boolean): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    const port = this.port;
    this.port = null;
    if (disconnect && port) {
      port.disconnect();
    }
    const resolve = this.resolveRun;
    this.resolveRun = null;
    resolve?.();
  }
}
