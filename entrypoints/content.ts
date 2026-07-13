import pickerCss from "../src/content/picker/picker.css?inline";
import translationCss from "../src/content/region/translation.css?inline";
import { RegionPicker } from "../src/content/picker/region-picker";
import { scanRegion } from "../src/content/region/scan-region";
import { RegionTranslationSession } from "../src/content/region/translation-session";

class LingoFrameController {
  private picker: RegionPicker | null = null;
  private session: RegionTranslationSession | null = null;

  async start(): Promise<void> {
    this.picker?.cancel();
    this.session?.cancel();
    this.session = null;
    this.installTranslationStyles();

    const picker = new RegionPicker(pickerCss);
    this.picker = picker;
    const selectedRegion = await picker.pick();

    if (this.picker !== picker) {
      return;
    }
    this.picker = null;
    if (!selectedRegion) {
      return;
    }

    const selectedRoot = selectedRegion.getRootNode();
    if (selectedRoot instanceof Document || selectedRoot instanceof ShadowRoot) {
      this.installTranslationStyles(selectedRoot);
    }

    const units = scanRegion(selectedRegion);
    if (units.length === 0) {
      this.showMessage("No readable text found in this region");
      return;
    }

    const session = new RegionTranslationSession(units);
    this.session = session;
    await session.run();
  }

  private installTranslationStyles(root: Document | ShadowRoot = document): void {
    if (root.querySelector("style[data-lingo-frame-styles]")) {
      return;
    }

    const style = document.createElement("style");
    style.setAttribute("data-lingo-frame-styles", "");
    style.textContent = translationCss;
    if (root instanceof Document) {
      (root.head ?? root.documentElement).appendChild(style);
      return;
    }

    root.appendChild(style);
  }

  private showMessage(message: string): void {
    const toast = document.createElement("div");
    toast.className = "lingo-frame-toast";
    toast.setAttribute("data-lingo-frame-ui", "");
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 3_000);
  }
}

declare global {
  var __LINGO_FRAME_CONTROLLER__: LingoFrameController | undefined;
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  registration: "runtime",
  runAt: "document_idle",
  main() {
    globalThis.__LINGO_FRAME_CONTROLLER__ ??= new LingoFrameController();
    void globalThis.__LINGO_FRAME_CONTROLLER__.start();
  },
});
