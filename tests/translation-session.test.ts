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
import partialFailureArticle from "./fixtures/translation-sessions/partial-failure-article.html?raw";
import progressiveArticle from "./fixtures/translation-sessions/progressive-article.html?raw";
import shortBlankLinePost from "./fixtures/translation-sessions/short-blank-line-post.txt?raw";
import shortSections from "./fixtures/translation-sessions/short-sections.html?raw";
import segmentLimit from "./fixtures/translation-sessions/segment-limit.html?raw";

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
    document.body.innerHTML = progressiveArticle;
    const session = new RegionTranslationSession(scanRegion(
      document.querySelector("#selected")!,
    ));

    const running = session.run();
    const start = port.posted[0];
    expect(start?.type).toBe("START_TRANSLATION_SESSION");
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }
    expect(start).toMatchSnapshot({ sessionId: expect.any(String) });

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
    expect(document.querySelectorAll(".lingo-frame-loading")).toHaveLength(4);
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

    expect(document.querySelectorAll(".lingo-frame-bilingual-content")).toHaveLength(6);
    expect(document.querySelectorAll(".lingo-frame-loading")).toHaveLength(0);
    expect(document.querySelectorAll("[data-lingo-frame-translated='true']")).toHaveLength(6);
  });

  it("keeps short blank-line segments in one request and one Slot", async () => {
    const root = document.createElement("pre");
    root.textContent = shortBlankLinePost;
    document.body.appendChild(root);
    const session = new RegionTranslationSession(scanRegion(root));

    const running = session.run();
    const start = port.posted[0];
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }
    expect(start).toMatchSnapshot({ sessionId: expect.any(String) });

    port.emit({
      type: "TRANSLATION_CHUNK_COMPLETED",
      sessionId: start.sessionId,
      chunkId: start.chunks[0]!.id,
      translations: [
        { id: start.chunks[0]!.segments[0]!.id, text: "第一段。" },
        { id: start.chunks[0]!.segments[1]!.id, text: "第二段。" },
        { id: start.chunks[0]!.segments[2]!.id, text: "第三段。" },
      ],
    });
    const slot = root.querySelector(".lingo-frame-translation-slot")!;
    port.emit({ type: "TRANSLATION_SESSION_COMPLETED", sessionId: start.sessionId });
    await running;

    expect(slot.textContent).toBe("第一段。\n\n第二段。\n\n第三段。");
    expect(root.getAttribute("data-lingo-frame-translated")).toBe("true");
  });

  it("merges short sections until the first feedback window is useful", async () => {
    document.body.innerHTML = shortSections;
    const session = new RegionTranslationSession(scanRegion(
      document.querySelector("#selected")!,
    ));

    session.run();
    const start = port.posted[0];
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }

    expect(start).toMatchSnapshot({ sessionId: expect.any(String) });
    session.cancel();
  });

  it("caps each request at sixteen segments", async () => {
    document.body.innerHTML = segmentLimit;
    const session = new RegionTranslationSession(scanRegion(
      document.querySelector("#selected")!,
    ));

    session.run();
    const start = port.posted[0];
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }

    expect(start).toMatchSnapshot({ sessionId: expect.any(String) });
    session.cancel();
  });

  it("keeps completed translations when a later chunk fails", async () => {
    document.body.innerHTML = partialFailureArticle;
    const session = new RegionTranslationSession(scanRegion(
      document.querySelector("#selected")!,
    ));

    const running = session.run();
    const start = port.posted[0];
    if (!start || start.type !== "START_TRANSLATION_SESSION") {
      throw new Error("Translation Session did not start");
    }
    expect(start).toMatchSnapshot({ sessionId: expect.any(String) });
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
