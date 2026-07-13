import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { scanRegion } from "../src/content/region/scan-region";

afterEach(() => {
  document.body.replaceChildren();
});

describe("scanRegion", () => {
  it("collects readable blocks only inside the selected root", () => {
    document.body.innerHTML = `
      <article id="selected">
        <h2>A useful title</h2>
        <p>Read <strong>this paragraph</strong> carefully.</p>
        <ul><li>First list item</li><li>Second list item</li></ul>
      </article>
      <p id="outside">Outside text must stay untouched.</p>
    `;

    const root = document.querySelector("#selected")!;
    const units = scanRegion(root);

    expect(units.map(({ element }) => element.tagName)).toEqual(["H2", "P", "LI", "LI"]);
    expect(units.map(({ id }) => id)).toEqual(["unit-0", "unit-1", "unit-2", "unit-3"]);
    expect(units.map(({ role }) => role)).toEqual([
      "heading",
      "paragraph",
      "list-item",
      "list-item",
    ]);
    expect(units.some(({ element }) => element.id === "outside")).toBe(false);
  });

  it("uses a leaf container as one translation unit", () => {
    document.body.innerHTML = `
      <section id="chat">
        <div class="message"><span>Hello</span> <em>from a chat message</em></div>
        <div class="message"><span>Another message</span></div>
      </section>
    `;

    const units = scanRegion(document.querySelector("#chat")!);

    expect(units).toHaveLength(2);
    expect(units.every(({ element }) => element.classList.contains("message"))).toBe(true);
  });

  it("does not duplicate parent and child candidates", () => {
    document.body.innerHTML = `
      <ul id="selected"><li><p>Nested paragraph content</p></li></ul>
    `;

    const units = scanRegion(document.querySelector("#selected")!);

    expect(units).toHaveLength(1);
    expect(units[0]?.element.tagName).toBe("P");
  });

  it("skips hidden, editable, code, and already translated content", () => {
    document.body.innerHTML = `
      <section id="selected">
        <p>Visible paragraph</p>
        <p hidden>Hidden paragraph</p>
        <p contenteditable="true">Editable paragraph</p>
        <pre>const secret = true</pre>
        <p data-lingo-frame-translated="true">Already translated</p>
      </section>
    `;

    const units = scanRegion(document.querySelector("#selected")!);

    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("Visible paragraph");
  });

  it("falls back to the selected inline region without climbing outside it", () => {
    document.body.innerHTML = `
      <p>Parent text <span id="selected">selected inline phrase</span></p>
    `;

    const units = scanRegion(document.querySelector("#selected")!);

    expect(units).toHaveLength(1);
    expect(units[0]?.element.id).toBe("selected");
  });

  it("reads natural-language prose when a pre element is the selected root", () => {
    document.body.innerHTML = readFileSync(
      "tests/fixtures/region-scanning/prose--preformatted-article.html",
      "utf8",
    );

    const root = document.querySelector("#selected")!;
    const units = scanRegion(root);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      element: root,
      role: "text",
      text: "Preformatted prose can carry a complete article without containing source code.",
      slot: { parent: root, before: null },
    });
  });

  it("keeps code excluded when the selected pre contains a code element", () => {
    document.body.innerHTML = `
      <pre id="selected"><code>const privateCode = true;</code></pre>
    `;

    expect(scanRegion(document.querySelector("#selected")!)).toEqual([]);
  });

  it("does not translate a selected root that is hidden, editable, or owned by the extension", () => {
    for (const markup of [
      '<p hidden>Hidden root</p>',
      '<p contenteditable="true">Editable root</p>',
      '<p data-lingo-frame-ui>Extension-owned root</p>',
      '<p data-lingo-frame-translated="true">Translated root</p>',
    ]) {
      document.body.innerHTML = markup;
      expect(scanRegion(document.body.firstElementChild!)).toEqual([]);
    }
  });

  it("keeps fallback text while excluding code and hidden descendant content", () => {
    document.body.innerHTML = `
      <section id="selected">
        Readable introduction
        <pre>const privateCode = true</pre>
        <span hidden>Hidden note</span>
      </section>
    `;

    const units = scanRegion(document.querySelector("#selected")!);

    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("Readable introduction");
  });

  it("preserves a parent list item's own text without duplicating its child item", () => {
    document.body.innerHTML = `
      <ul id="selected">
        <li>Parent item<ul><li>Child item</li></ul></li>
      </ul>
    `;

    const units = scanRegion(document.querySelector("#selected")!);

    expect(units.map(({ text }) => text)).toEqual(["Parent item", "Child item"]);
  });

  it("keeps a container's introductory text alongside nested paragraph units", () => {
    document.body.innerHTML = `
      <section id="selected">
        <div>Important introduction <p>Paragraph body</p></div>
        <p>Second paragraph</p>
      </section>
    `;

    const units = scanRegion(document.querySelector("#selected")!);

    expect(units.map(({ text }) => text)).toEqual([
      "Important introduction",
      "Paragraph body",
      "Second paragraph",
    ]);
    expect(units[0]?.slot.parent).toBe(document.querySelector("#selected > div"));
    expect(units[0]?.slot.before).toBe(document.querySelector("#selected > div > p"));
  });

  it("splits hard-break content into interleaved translation units", () => {
    document.body.innerHTML = `
      <div id="selected">First paragraph.<br><br>1. First item<br>2. Second item</div>
    `;

    const units = scanRegion(document.querySelector("#selected")!);
    const breaks = document.querySelectorAll("#selected br");

    expect(units.map(({ text }) => text)).toEqual([
      "First paragraph.",
      "1. First item",
      "2. Second item",
    ]);
    expect(units.map(({ role }) => role)).toEqual(["text", "text", "text"]);
    expect(units[0]?.slot.before).toBe(breaks[0]);
    expect(units[1]?.slot.before).toBe(breaks[2]);
    expect(units[2]?.slot.before).toBeNull();
  });

  it("keeps text-node line breaks inside one translation unit", () => {
    const root = document.createElement("span");
    root.id = "selected";
    root.textContent = "First paragraph.\n\nSecond paragraph.";
    document.body.appendChild(root);

    const units = scanRegion(root);

    expect(units).toHaveLength(1);
    expect(units[0]?.text).toBe("First paragraph.\n\nSecond paragraph.");
    expect(units[0]?.slot).toEqual({ parent: root, before: null });
  });
});
