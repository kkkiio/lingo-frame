import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TranslationSessionCommand,
  TranslationSessionEvent,
} from "../src/shared/messages";

const runtime = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("wxt/browser", () => ({
  browser: { runtime },
}));

import { scanRegion } from "../src/content/region/scan-region";
import { RegionTranslationSession } from "../src/content/region/translation-session";

interface FakePort {
  name: string;
  posted: TranslationSessionCommand[];
  disconnected: boolean;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
  };
  postMessage(message: TranslationSessionCommand): void;
  disconnect(): void;
  emit(message: TranslationSessionEvent): void;
}

let port: FakePort;

beforeEach(() => {
  const messageListeners: Array<(message: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  port = {
    name: "LINGO_FRAME_TRANSLATION_SESSION",
    posted: [],
    disconnected: false,
    onMessage: {
      addListener(listener) {
        messageListeners.push(listener);
      },
    },
    onDisconnect: {
      addListener(listener) {
        disconnectListeners.push(listener);
      },
    },
    postMessage(message) {
      this.posted.push(message);
    },
    disconnect() {
      if (this.disconnected) {
        return;
      }
      this.disconnected = true;
      disconnectListeners.forEach((listener) => listener());
    },
    emit(message) {
      messageListeners.forEach((listener) => listener(message));
    },
  };
  runtime.connect.mockReturnValue(port);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("RegionTranslationSession", () => {
  it("groups a heading with its section and renders completed chunks immediately", async () => {
    document.body.innerHTML = `
      <article id="selected">
        <h1>Article title</h1>
        <p>Introduction paragraph</p>
        <div style="display: inline"><h2>Second section</h2></div>
        <p>Section paragraph</p>
      </article>
    `;
    const session = new RegionTranslationSession(scanRegion(
      document.querySelector("#selected")!,
    ));

    const running = session.run();
    const start = port.posted[0];
    expect(start?.type).toBe("START_TRANSLATION_SESSION");
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }
    expect(start.chunks.map(({ segments }) => segments.map(({ text }) => text))).toEqual([
      ["Article title", "Introduction paragraph"],
      ["Second section", "Section paragraph"],
    ]);

    const firstChunk = start.chunks[0]!;
    port.emit({
      type: "TRANSLATION_CHUNK_COMPLETED",
      sessionId: start.sessionId,
      chunkId: firstChunk.id,
      translations: firstChunk.segments.map(({ id }, index) => ({
        id,
        text: index === 0 ? "文章标题" : "介绍段落",
      })),
    });
    expect(document.querySelectorAll(".lingo-frame-bilingual-content")).toHaveLength(2);
    expect(document.querySelectorAll(".lingo-frame-loading")).toHaveLength(2);
    expect(document.querySelector("h1")?.textContent).toContain("文章标题");

    const secondChunk = start.chunks[1]!;
    port.emit({
      type: "TRANSLATION_CHUNK_COMPLETED",
      sessionId: start.sessionId,
      chunkId: secondChunk.id,
      translations: secondChunk.segments.map(({ id }, index) => ({
        id,
        text: index === 0 ? "第二节" : "章节段落",
      })),
    });
    port.emit({
      type: "TRANSLATION_SESSION_COMPLETED",
      sessionId: start.sessionId,
    });
    await running;

    expect(document.querySelectorAll(".lingo-frame-bilingual-content")).toHaveLength(4);
    expect(document.querySelectorAll(".lingo-frame-loading")).toHaveLength(0);
    expect(document.querySelectorAll("[data-lingo-frame-translated='true']")).toHaveLength(4);
  });

  it("splits text-node blank lines but merges translations into one Slot", async () => {
    const root = document.createElement("pre");
    root.textContent = "First paragraph.\n\nSecond paragraph.";
    document.body.appendChild(root);
    const session = new RegionTranslationSession(scanRegion(root));

    const running = session.run();
    const start = port.posted[0];
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }
    expect(start.chunks).toHaveLength(2);
    expect(start.chunks.flatMap(({ segments }) => segments.map(({ unitId }) => unitId)))
      .toEqual(["unit-0", "unit-0"]);

    port.emit({
      type: "TRANSLATION_CHUNK_COMPLETED",
      sessionId: start.sessionId,
      chunkId: start.chunks[0]!.id,
      translations: [{ id: start.chunks[0]!.segments[0]!.id, text: "第一段。" }],
    });
    const slot = root.querySelector(".lingo-frame-translation-slot")!;
    expect(slot.textContent).toContain("第一段。");
    expect(slot.querySelector(".lingo-frame-loading")).not.toBeNull();
    expect(root.hasAttribute("data-lingo-frame-translated")).toBe(false);

    port.emit({
      type: "TRANSLATION_CHUNK_COMPLETED",
      sessionId: start.sessionId,
      chunkId: start.chunks[1]!.id,
      translations: [{ id: start.chunks[1]!.segments[0]!.id, text: "第二段。" }],
    });
    port.emit({ type: "TRANSLATION_SESSION_COMPLETED", sessionId: start.sessionId });
    await running;

    expect(slot.textContent).toBe("第一段。\n\n第二段。");
    expect(root.getAttribute("data-lingo-frame-translated")).toBe("true");
  });

  it("keeps completed translations when a later chunk fails", async () => {
    document.body.innerHTML = `
      <article id="selected">
        <h2>First section</h2><p>First paragraph</p>
        <h2>Second section</h2><p>Second paragraph</p>
      </article>
    `;
    const session = new RegionTranslationSession(scanRegion(
      document.querySelector("#selected")!,
    ));

    const running = session.run();
    const start = port.posted[0];
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }
    const firstChunk = start.chunks[0]!;
    port.emit({
      type: "TRANSLATION_CHUNK_COMPLETED",
      sessionId: start.sessionId,
      chunkId: firstChunk.id,
      translations: firstChunk.segments.map(({ id }) => ({ id, text: `译文-${id}` })),
    });
    port.emit({
      type: "TRANSLATION_SESSION_FAILED",
      sessionId: start.sessionId,
      error: "Translation API returned 429: rate limited",
    });
    await running;

    expect(document.querySelectorAll(".lingo-frame-bilingual-content")).toHaveLength(2);
    expect(document.querySelectorAll(".lingo-frame-failure")).toHaveLength(2);
    expect(document.querySelector("h2")?.textContent).toContain("译文-unit-0:segment-0");
    expect(document.querySelector(".lingo-frame-failure")?.textContent).toContain("429");
  });
});
