import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let server: Server;
let origin: string;
let context: BrowserContext;
let worker: Worker;
let profilePath: string;
let extensionOrigin: string;
let providerRequests: Array<{
  units: Array<{ id: string; role: string; text: string }>;
}> = [];

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/v1/chat/completions") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const payload = JSON.parse(body);
        const providerRequest = JSON.parse(payload.messages.at(-1).content);
        providerRequests.push(providerRequest);
        const translations: Record<string, string> = {
          "How small questions reshape a big idea": "小问题如何重塑一个大想法",
          "Reading becomes active when we pause at uncertainty, connect it to what we know, and let new context change the whole picture.": "当我们在不确定之处停下来，将它与已知经验连接，并让新的语境改变整体图景时，阅读就真正变得主动。",
          "Keep the original nearby while you explore the translation.": "探索译文时，让原文始终近在眼前。",
          "Readable text inside an open shadow root.": "开放式 Shadow Root 内的可读文本。",
          "First paragraph.": "第一段。",
          "1. First item": "1. 第一项",
          "2. Second item": "2. 第二项",
          "First paragraph.\n\nSecond paragraph.": "第一段。\n\n第二段。",
          "Preformatted prose can carry a complete article without containing source code.": "预格式化文本也可以承载不含源代码的完整文章。",
        };
        if (
          providerRequest.units.some((unit: { text: string }) => unit.text === "Provider failure.")
        ) {
          response.writeHead(429).end("rate limited");
          return;
        }
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            translations: providerRequest.units.map((unit: { id: string; text: string }) => ({
              id: unit.id,
              text: translations[unit.text] ?? `译文：${unit.text}`,
            })),
          }) } }],
        }));
      });
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html>
      <html><head><style>
        * { box-sizing: border-box; }
        body { margin: 0; color: #18181b; background: #ffffff; font: 16px/1.55 Inter, ui-sans-serif, system-ui, sans-serif; }
        .shell { display: grid; grid-template-columns: 80px minmax(0, 700px) 320px; width: min(1180px, 100%); min-height: 100vh; margin: 0 auto; }
        .rail { display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 18px 12px; border-right: 1px solid #e4e4e7; }
        .rail-mark { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 14px; background: linear-gradient(145deg, #4f46e5, #7c3aed); color: white; font-weight: 900; box-shadow: 0 8px 24px #4f46e533; }
        .rail-icon { width: 22px; height: 22px; border: 2px solid #27272a; border-radius: 7px; opacity: .9; }
        .rail-icon.round { border-radius: 50%; }
        .rail-icon.line { height: 3px; margin-block: 2px; border: 0; border-radius: 999px; background: #27272a; }
        .content { min-width: 0; border-right: 1px solid #e4e4e7; }
        .topbar { display: flex; align-items: center; gap: 20px; height: 62px; padding: 0 24px; border-bottom: 1px solid #e4e4e7; background: #ffffffee; }
        .back { font-size: 25px; }
        .topbar strong { font-size: 20px; }
        .author { display: flex; align-items: center; gap: 12px; padding: 20px 30px 12px; }
        .avatar { display: grid; width: 44px; height: 44px; flex: none; place-items: center; border-radius: 50%; background: #18181b; color: white; font-weight: 800; }
        .author-copy { display: grid; gap: 1px; }
        .author-copy strong { font-size: 15px; }
        .author-copy span { color: #71717a; font-size: 14px; }
        article { padding: 6px 30px 28px; background: white; }
        article h1 { max-width: 600px; margin: 0 0 16px; font-size: 32px; line-height: 1.16; letter-spacing: -.035em; }
        article p { max-width: 620px; margin: 0 0 18px; color: #27272a; font-size: 18px; line-height: 1.58; }
        article a { color: #4f46e5; font-weight: 650; text-decoration-thickness: 1px; text-underline-offset: 4px; }
        .essay-visual { display: grid; width: 100%; height: 220px; margin: 22px 0 20px; place-items: center; overflow: hidden; border: 1px solid #eee9df; border-radius: 20px; background: #f8f5ed; }
        .essay-visual svg { width: 92%; height: 88%; }
        .discussion { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 30px; border-top: 1px solid #e4e4e7; color: #71717a; }
        #page-button { padding: 9px 15px; border: 1px solid #d4d4d8; border-radius: 999px; background: white; color: #27272a; font: inherit; font-weight: 700; }
        .side { padding: 18px 22px; }
        .search { padding: 12px 16px; border: 1px solid #e4e4e7; border-radius: 999px; background: #fafafa; color: #71717a; }
        .side-card { margin-top: 18px; padding: 20px; border: 1px solid #e4e4e7; border-radius: 18px; }
        .side-card h2 { margin: 0 0 14px; font-size: 19px; }
        .recommendation { padding: 12px 0; border-top: 1px solid #f1f1f3; }
        .recommendation:first-of-type { border-top: 0; }
        .recommendation strong { display: block; margin-bottom: 3px; font-size: 14px; }
        .recommendation span { color: #71717a; font-size: 13px; }
      </style></head><body>
        <div class="shell">
          <nav class="rail" aria-label="Demo publication navigation">
            <div class="rail-mark">N</div>
            <div class="rail-icon round"></div>
            <div class="rail-icon"></div>
            <div class="rail-icon line"></div>
            <div class="rail-icon round"></div>
            <div class="rail-icon"></div>
          </nav>
          <main class="content">
            <header class="topbar"><span class="back">←</span><strong>Article</strong></header>
            <div class="author">
              <div class="avatar">AC</div>
              <div class="author-copy"><strong>Aria Chen</strong><span>@ariawrites · 8 min read</span></div>
            </div>
            <article id="region">
              <h1>How small questions reshape a big idea</h1>
              <p>Reading becomes active when we pause at uncertainty, connect it to what we know, and let new context change the whole picture.</p>
              <figure class="essay-visual" aria-label="An abstract map of connected ideas">
                <svg aria-hidden="true" viewBox="0 0 620 190" fill="none">
                  <path d="M70 132C145 132 164 48 242 61C319 74 342 145 420 126C474 113 500 70 552 55" stroke="#27272a" stroke-width="4" stroke-linecap="round"/>
                  <path d="M72 132L242 61L420 126L552 55" stroke="#7c3aed" stroke-width="2" stroke-dasharray="7 9" opacity=".55"/>
                  <circle cx="70" cy="132" r="12" fill="#4f46e5"/>
                  <circle cx="242" cy="61" r="12" fill="#ffffff" stroke="#27272a" stroke-width="4"/>
                  <circle cx="420" cy="126" r="12" fill="#ffffff" stroke="#7c3aed" stroke-width="4"/>
                  <circle cx="552" cy="55" r="12" fill="#27272a"/>
                  <path d="M170 125L189 92L208 125H170Z" fill="#ffffff" stroke="#27272a" stroke-width="3"/>
                  <path d="M335 62C335 49 345 39 358 39C371 39 381 49 381 62C381 75 358 91 358 91C358 91 335 75 335 62Z" fill="#ddd6fe" stroke="#7c3aed" stroke-width="3"/>
                </svg>
              </figure>
              <p><a id="danger" href="#clicked">Keep the original nearby while you explore the translation.</a></p>
            </article>
            <aside id="outside" class="discussion">
              <span>Reader notes stay outside the selected article Region.</span>
              <button id="page-button">Save article</button>
            </aside>
          </main>
          <aside class="side">
            <div class="search">Search essays</div>
            <section class="side-card">
              <h2>More thoughtful reads</h2>
              <div class="recommendation"><strong>Designing for deliberate attention</strong><span>6 min read</span></div>
              <div class="recommendation"><strong>What diagrams leave unsaid</strong><span>9 min read</span></div>
              <div class="recommendation"><strong>A practice for clearer questions</strong><span>5 min read</span></div>
            </section>
          </aside>
        </div>
        <script>
          window.pageClicks = 0;
          window.captureClicks = 0;
          window.addEventListener('pointerdown', () => window.captureClicks++, true);
          window.addEventListener('click', () => window.captureClicks++, true);
          document.querySelector('#danger')?.addEventListener('click', () => window.pageClicks++);
          document.querySelector('#page-button').addEventListener('click', () => window.pageClicks++);
          if (location.pathname === '/shadow') {
            const host = document.createElement('shadow-region-host');
            const root = host.attachShadow({ mode: 'open' });
            root.innerHTML = \`
              <style>
                :host { display:block; max-width:920px; margin:24px auto; }
                article { padding:28px; border-radius:18px; background:white; }
                span { display:none; }
              </style>
              <article id="shadow-region"><p>Readable text inside an open shadow root.</p></article>
            \`;
            document.body.append(host);
          }
          if (location.pathname === '/scroll') {
            const scroller = document.createElement('div');
            scroller.id = 'nested-scroller';
            scroller.style.cssText = 'height:120px;overflow:auto;margin-top:24px;background:white';
            scroller.innerHTML = '<div style="height:480px;padding:20px">Scrollable region content</div>';
            document.body.replaceChildren(scroller);
          }
          if (location.pathname === '/failure') {
            const failureRegion = document.createElement('article');
            failureRegion.id = 'failure-region';
            failureRegion.innerHTML = '<p>Provider failure.</p><p>Keep this Region together.</p>';
            document.body.replaceChildren(failureRegion);
          }
          if (location.pathname === '/structure') {
            const structureRegion = document.createElement('div');
            structureRegion.id = 'structure-region';
            structureRegion.innerHTML = 'First paragraph.<br><br>1. First item<br>2. Second item';
            document.body.replaceChildren(structureRegion);
          }
          if (location.pathname === '/line-breaks') {
            const lineBreakRegion = document.createElement('span');
            lineBreakRegion.id = 'line-break-region';
            lineBreakRegion.style.whiteSpace = 'pre-wrap';
            lineBreakRegion.textContent = 'First paragraph.\\n\\nSecond paragraph.';
            document.body.replaceChildren(lineBreakRegion);
          }
          if (location.pathname === '/preformatted-prose') {
            const preformattedRegion = document.createElement('pre');
            preformattedRegion.id = 'preformatted-prose-region';
            preformattedRegion.style.cssText = 'margin:40px;white-space:pre-wrap;font:18px/1.6 Georgia,serif';
            preformattedRegion.textContent = 'Preformatted prose can carry a complete article without containing source code.';
            document.body.replaceChildren(preformattedRegion);
          }
          if (location.pathname === '/mentions') {
            const mentionRegion = document.createElement('div');
            mentionRegion.id = 'mention-region';
            mentionRegion.style.cssText = 'margin:40px;font:18px/1.6 Georgia,serif';
            mentionRegion.innerHTML = 'Native web search is powered by <div style="display:inline-flex"><a href="#exa">@ExaAILabs</a></div> and <div style="display:inline-grid"><a href="#partner">@SearchPartner</a></div>.';
            document.body.replaceChildren(mentionRegion);
          }
        </script>
      </body></html>`);
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start the E2E server");
  }
  origin = `http://127.0.0.1:${address.port}`;

  profilePath = await mkdtemp(join(tmpdir(), "lingo-frame-e2e-"));
  const extensionPath = resolve("output/chrome-mv3-e2e");
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const workerUrl = new URL(worker.url());
  extensionOrigin = `${workerUrl.protocol}//${workerUrl.host}`;
  await worker.evaluate(async ({ baseUrl }) => {
    await chrome.storage.local.set({
      settings: {
        provider: "openai-compatible",
        targetLanguage: "Simplified Chinese",
        providers: {
          deepseek: {
            apiKey: "",
            baseUrl: "https://api.deepseek.com",
            model: "deepseek-v4-flash",
          },
          "openai-compatible": {
            apiKey: "e2e-key",
            baseUrl,
            model: "mock-model",
          },
        },
      },
    });
  }, { baseUrl: `${origin}/v1` });
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolveClose) => server?.close(() => resolveClose()));
  if (profilePath) {
    await rm(profilePath, { recursive: true, force: true });
  }
});

async function activatePicker(): Promise<void> {
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) {
      throw new Error("No active tab found");
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/content-scripts/content.js"],
    });
  });
}

test("selects one region, suppresses the page click, and renders bilingual text", async () => {
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin);
  await activatePicker();
  const requestCount = providerRequests.length;

  const picker = page.locator("iframe[data-lingo-frame-picker]");
  const pickerFrame = page.frameLocator("iframe[data-lingo-frame-picker]");
  await expect(picker).toHaveCount(1);
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe[data-lingo-frame-picker]")!;
    frame.contentWindow!.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 1 }));
  });
  await expect(picker).toHaveCount(1);
  const regionBox = await page.locator("#region").boundingBox();
  expect(regionBox).not.toBeNull();
  await page.mouse.move(regionBox!.x + 12, regionBox!.y + 12);
  await expect(pickerFrame.locator(".lingo-frame-picker-highlight")).toBeVisible();
  if (process.env.CAPTURE_DEMO === "1") {
    await page.waitForTimeout(100);
    await page.screenshot({ path: resolve("docs/images/region-picker.png") });
  }
  await page.mouse.click(regionBox!.x + 12, regionBox!.y + 12);

  await expect(picker).toHaveCount(0);
  await expect(page.locator("#region .lingo-frame-bilingual-content")).toHaveCount(3);
  await expect(page.locator("#outside .lingo-frame-bilingual-content")).toHaveCount(0);
  await expect(page.locator("#region")).toContainText("小问题如何重塑一个大想法");
  await expect(page).not.toHaveURL(/#clicked$/);
  expect(await page.evaluate(() => (window as unknown as { pageClicks: number }).pageClicks)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { captureClicks: number }).captureClicks)).toBe(0);
  expect(providerRequests).toHaveLength(requestCount + 1);
  expect(providerRequests.at(-1)?.units.map(({ text }) => text)).toEqual([
    "How small questions reshape a big idea",
    "Reading becomes active when we pause at uncertainty, connect it to what we know, and let new context change the whole picture.",
    "Keep the original nearby while you explore the translation.",
  ]);
  await expect(page.locator("#region h1 > .lingo-frame-bilingual-content"))
    .toHaveText("小问题如何重塑一个大想法");
  await expect(page.locator("#danger .lingo-frame-bilingual-content")).toHaveCount(0);
  if (process.env.CAPTURE_DEMO === "1") {
    await page.screenshot({ path: resolve("docs/images/bilingual-result.png") });
  }
});

test("keeps hard-break content interleaved in one LLM Session message", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/structure`);
  await activatePicker();
  const requestCount = providerRequests.length;

  const region = page.locator("#structure-region");
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  await page.mouse.click(box!.x + 12, box!.y + 12);

  const translations = region.locator(":scope > .lingo-frame-bilingual-content");
  await expect(translations).toHaveCount(3);
  await expect(translations.nth(0)).toHaveText("第一段。");
  await expect(translations.nth(1)).toHaveText("1. 第一项");
  await expect(translations.nth(2)).toHaveText("2. 第二项");
  expect(providerRequests).toHaveLength(requestCount + 1);
  expect(providerRequests.at(-1)?.units.map(({ text }) => text)).toEqual([
    "First paragraph.",
    "1. First item",
    "2. Second item",
  ]);
});

test("preserves text-node line breaks in one translation block", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/line-breaks`);
  await activatePicker();
  const requestCount = providerRequests.length;

  const region = page.locator("#line-break-region");
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  await page.mouse.click(box!.x + 12, box!.y + 12);

  const translation = region.locator(":scope > .lingo-frame-bilingual-content");
  await expect(translation).toHaveCount(1);
  await expect(translation).toHaveText("第一段。\n\n第二段。");
  await expect(translation).toHaveCSS("white-space", "pre-wrap");
  expect(providerRequests).toHaveLength(requestCount + 1);
  expect(providerRequests.at(-1)?.units).toEqual([{
    id: "unit-0",
    role: "text",
    text: "First paragraph.\n\nSecond paragraph.",
  }]);
});

test("translates natural-language prose in an explicitly selected pre region", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/preformatted-prose`);
  await activatePicker();
  const requestCount = providerRequests.length;

  const region = page.locator("#preformatted-prose-region");
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  const highlight = page.frameLocator("iframe[data-lingo-frame-picker]")
    .locator(".lingo-frame-picker-highlight");
  await expect(highlight).toHaveAttribute("data-candidate", "pre");
  await page.mouse.click(box!.x + 12, box!.y + 12);

  const translation = region.locator(":scope > .lingo-frame-bilingual-content");
  await expect(translation).toHaveCount(1);
  await expect(translation).toHaveText("预格式化文本也可以承载不含源代码的完整文章。");
  expect(providerRequests).toHaveLength(requestCount + 1);
  expect(providerRequests.at(-1)?.units).toEqual([{
    id: "unit-0",
    role: "text",
    text: "Preformatted prose can carry a complete article without containing source code.",
  }]);
});

test("keeps inline mentions in their surrounding translation unit", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/mentions`);
  await activatePicker();
  const requestCount = providerRequests.length;

  const region = page.locator("#mention-region");
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  await page.mouse.click(box!.x + 12, box!.y + 12);

  await expect(region.locator(":scope > .lingo-frame-bilingual-content")).toHaveCount(1);
  await expect(region.locator(":scope > div > .lingo-frame-bilingual-content")).toHaveCount(0);
  expect(providerRequests).toHaveLength(requestCount + 1);
  expect(providerRequests.at(-1)?.units).toEqual([{
    id: "unit-0",
    role: "text",
    text: "Native web search is powered by @ExaAILabs and @SearchPartner.",
  }]);
});

test("Escape removes the picker and restores normal page interaction", async () => {
  const page = context.pages()[0]!;
  await page.goto(origin);
  await activatePicker();
  await expect(page.locator("iframe[data-lingo-frame-picker]")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator("iframe[data-lingo-frame-picker]")).toHaveCount(0);
  await page.locator("#page-button").click();
  expect(await page.evaluate(() => (window as unknown as { pageClicks: number }).pageClicks)).toBe(1);
});

test("deep-selects an open shadow root and installs bilingual styles inside it", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/shadow`);
  await activatePicker();

  const region = page.locator("shadow-region-host").locator("#shadow-region");
  await region.scrollIntoViewIfNeeded();
  const regionBox = await region.boundingBox();
  expect(regionBox).not.toBeNull();
  const stack = await page.evaluate(({ x, y }) => {
    const picker = document.querySelector<HTMLIFrameElement>("iframe[data-lingo-frame-picker]")!;
    picker.style.setProperty("pointer-events", "none", "important");
    const names = document.elementsFromPoint(x, y).map((element) => element.localName);
    picker.style.setProperty("pointer-events", "auto", "important");
    return names;
  }, { x: regionBox!.x + 12, y: regionBox!.y + 12 });
  expect(stack).toContain("shadow-region-host");
  await page.mouse.move(regionBox!.x + 12, regionBox!.y + 12);
  const shadowHighlight = page.frameLocator("iframe[data-lingo-frame-picker]")
    .locator(".lingo-frame-picker-highlight");
  await expect(shadowHighlight).toHaveAttribute("data-candidate", "article");
  await page.mouse.click(regionBox!.x + 12, regionBox!.y + 12);

  const translation = region.locator(".lingo-frame-bilingual-content");
  await expect(translation).toHaveCount(1);
  await expect(translation).toBeVisible();
  await expect(translation).toHaveCSS("display", "block");
  await expect(translation).toHaveCSS("font-weight", "700");
});

test("routes picker wheel input to the nearest nested scroll container", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/scroll`);
  const scroller = page.locator("#nested-scroller");
  await scroller.scrollIntoViewIfNeeded();
  await activatePicker();

  const box = await scroller.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 30, box!.y + 30);
  await page.mouse.wheel(0, 180);

  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("iframe[data-lingo-frame-picker]")).toHaveCount(0);
});

test("shows a provider error without retry controls", async () => {
  const page = context.pages()[0]!;
  await page.goto(`${origin}/failure`);
  await activatePicker();
  const requestCount = providerRequests.length;

  const region = page.locator("#failure-region");
  const box = await region.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + 12);
  await page.mouse.click(box!.x + 12, box!.y + 12);

  const failures = region.locator(".lingo-frame-failure");
  await expect(failures).toHaveCount(2);
  await expect(failures.first()).toContainText("429");
  await expect(region.getByRole("button")).toHaveCount(0);
  expect(providerRequests).toHaveLength(requestCount + 1);
});

test("loads stored provider settings in the extension options page", async () => {
  const page = await context.newPage();
  await page.goto(`${extensionOrigin}/options.html`);

  await expect(page.getByRole("heading", { name: "LingoFrame settings" })).toBeVisible();
  const providerSelect = page.getByRole("combobox", { name: /^Provider/ });
  await expect(providerSelect).toHaveValue("openai-compatible");
  await expect(page.getByLabel("Target language")).toHaveValue("Simplified Chinese");
  await expect(page.getByLabel("API base URL")).toHaveValue(`${origin}/v1`);
  await expect(page.getByLabel("API key")).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Built-in default")).toBeChecked();

  await page.getByText("View built-in instructions").click();
  await expect(page.locator(".instructions-preview")).toContainText("Attention");

  await page.getByLabel("Custom").check();
  const customInstructions = page.getByLabel("Custom translation instructions");
  await expect(customInstructions).toHaveValue(/LLM/);
  await customInstructions.fill("Use concise technical language for domain experts.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved");
  expect(await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    return (settings as { translationInstructions: string | null }).translationInstructions;
  })).toBe("Use concise technical language for domain experts.");

  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByLabel("Built-in default")).toBeChecked();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved");
  expect(await worker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    return (settings as { translationInstructions: string | null }).translationInstructions;
  })).toBeNull();

  await providerSelect.selectOption("deepseek");
  await expect(page.getByLabel("API base URL")).toHaveValue("https://api.deepseek.com");
  await page.close();
});
