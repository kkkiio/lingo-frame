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
          "A focused translation workflow": "专注于当前内容的翻译流程",
          "LingoFrame translates the content region that the reader chooses.": "LingoFrame 只翻译读者所选择的内容区域。",
          "Selecting this link must not navigate.": "选择这个链接时不应触发页面跳转。",
          "Readable text inside an open shadow root.": "开放式 Shadow Root 内的可读文本。",
          "First paragraph.": "第一段。",
          "1. First item": "1. 第一项",
          "2. Second item": "2. 第二项",
          "First paragraph.\n\nSecond paragraph.": "第一段。\n\n第二段。",
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
        body { font: 16px/1.6 system-ui; max-width: 920px; margin: 50px auto; background:#f4f4f5; }
        article { background:white; padding:32px; border-radius:18px; box-shadow:0 12px 35px #18181b14; }
        aside { margin-top:24px; padding:20px; background:white; }
      </style></head><body>
        <article id="region">
          <h1>A focused translation workflow</h1>
          <p>LingoFrame translates the content region that the reader chooses.</p>
          <p><a id="danger" href="#clicked">Selecting this link must not navigate.</a></p>
        </article>
        <aside id="outside">This text is outside the selected region.</aside>
        <button id="page-button">Page button</button>
        <script>
          window.pageClicks = 0;
          window.captureClicks = 0;
          window.addEventListener('pointerdown', () => window.captureClicks++, true);
          window.addEventListener('click', () => window.captureClicks++, true);
          document.querySelector('#danger').addEventListener('click', () => window.pageClicks++);
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
            document.body.append(scroller);
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
    await page.screenshot({ path: resolve("docs/images/region-picker.png") });
  }
  await page.mouse.click(regionBox!.x + 12, regionBox!.y + 12);

  await expect(picker).toHaveCount(0);
  await expect(page.locator("#region .lingo-frame-bilingual-content")).toHaveCount(3);
  await expect(page.locator("#outside .lingo-frame-bilingual-content")).toHaveCount(0);
  await expect(page.locator("#region")).toContainText("专注于当前内容的翻译流程");
  await expect(page).not.toHaveURL(/#clicked$/);
  expect(await page.evaluate(() => (window as unknown as { pageClicks: number }).pageClicks)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { captureClicks: number }).captureClicks)).toBe(0);
  expect(providerRequests).toHaveLength(requestCount + 1);
  expect(providerRequests.at(-1)?.units.map(({ text }) => text)).toEqual([
    "A focused translation workflow",
    "LingoFrame translates the content region that the reader chooses.",
    "Selecting this link must not navigate.",
  ]);
  await expect(page.locator("#region h1 > .lingo-frame-bilingual-content"))
    .toHaveText("专注于当前内容的翻译流程");
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
  await expect(page.getByLabel("Translation provider")).toHaveValue("openai-compatible");
  await expect(page.getByLabel("Target language")).toHaveValue("Simplified Chinese");
  await expect(page.getByLabel("API base URL")).toHaveValue(`${origin}/v1`);
  await expect(page.getByLabel("API key")).toHaveAttribute("type", "password");

  await page.getByLabel("Translation provider").selectOption("deepseek");
  await expect(page.getByLabel("API base URL")).toHaveValue("https://api.deepseek.com");
  await page.close();
});
