const PICKER_HOST_ATTRIBUTE = "data-lingo-frame-picker";

export class RegionPicker {
  private readonly abortController = new AbortController();
  private readonly host = document.createElement("iframe");
  private readonly resizeObserver = new ResizeObserver(() => this.scheduleRender());
  private highlight: HTMLDivElement | null = null;
  private candidate: Element | null = null;
  private resolvePick: ((element: Element | null) => void) | null = null;
  private animationFrame = 0;
  private pointerX = Math.round(window.innerWidth / 2);
  private pointerY = Math.round(window.innerHeight / 2);
  private settled = false;

  constructor(private readonly cssText: string) {
    this.host.setAttribute(PICKER_HOST_ATTRIBUTE, "");
    this.host.title = "LingoFrame region picker";
    this.host.tabIndex = -1;
    for (const [property, value] of Object.entries({
      all: "initial",
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      border: "0",
      background: "transparent",
      "pointer-events": "auto",
      "z-index": "2147483647",
    })) {
      this.host.style.setProperty(property, value, "important");
    }
  }

  pick(): Promise<Element | null> {
    return new Promise((resolve) => {
      this.resolvePick = resolve;
      document.documentElement.appendChild(this.host);
      document.documentElement.classList.add("lingo-frame-is-picking");
      const overlayDocument = this.host.contentDocument;
      const overlayWindow = this.host.contentWindow;
      if (!overlayDocument || !overlayWindow || !overlayDocument.head || !overlayDocument.body) {
        this.finish(null);
        return;
      }

      const style = overlayDocument.createElement("style");
      const highlight = overlayDocument.createElement("div");
      const label = overlayDocument.createElement("div");
      style.textContent = this.cssText;
      highlight.className = "lingo-frame-picker-highlight";
      label.className = "lingo-frame-picker-label";
      label.textContent = "Click a region to translate · Esc to cancel";
      overlayDocument.head.replaceChildren(style);
      overlayDocument.body.replaceChildren(highlight, label);
      this.highlight = highlight;

      const signal = this.abortController.signal;
      const listenerOptions = { capture: true, signal } as AddEventListenerOptions;
      const passiveOptions = { capture: true, passive: true, signal } as AddEventListenerOptions;
      overlayWindow.addEventListener("pointermove", this.onPointerMove, passiveOptions);
      overlayWindow.addEventListener("mousemove", this.onPointerMove, passiveOptions);
      overlayWindow.addEventListener("pointerdown", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("mousedown", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("pointerup", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("mouseup", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("dblclick", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("contextmenu", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("dragstart", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("selectstart", this.suppressPageEvent, listenerOptions);
      overlayWindow.addEventListener("click", this.onClick, listenerOptions);
      overlayWindow.addEventListener("keydown", this.onKeyDown, listenerOptions);
      overlayWindow.addEventListener("wheel", this.onWheel, { ...listenerOptions, passive: false });
      window.addEventListener("keydown", this.onKeyDown, listenerOptions);
      window.addEventListener("scroll", this.scheduleRender, passiveOptions);
      window.addEventListener("resize", this.scheduleRender, passiveOptions);
      overlayWindow.focus();
      this.scheduleRender();
    });
  }

  cancel(): void {
    this.finish(null);
  }

  private readonly onPointerMove = (event: MouseEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.scheduleRender();
  };

  private readonly suppressPageEvent = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (!event.isTrusted) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const selected = this.findElementAtPoint(event.clientX, event.clientY);
    this.finish(selected);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const hit = this.findElementAtPoint(event.clientX, event.clientY);
    let scrollTarget = hit instanceof HTMLElement ? hit : hit?.parentElement ?? null;
    let handled = false;

    while (scrollTarget) {
      const style = getComputedStyle(scrollTarget);
      const maxTop = scrollTarget.scrollHeight - scrollTarget.clientHeight;
      const maxLeft = scrollTarget.scrollWidth - scrollTarget.clientWidth;
      const canMoveVertically = (
        /auto|scroll|overlay/.test(style.overflowY) &&
        maxTop > 0 &&
        ((event.deltaY < 0 && scrollTarget.scrollTop > 0) ||
          (event.deltaY > 0 && scrollTarget.scrollTop < maxTop))
      );
      const canMoveHorizontally = (
        /auto|scroll|overlay/.test(style.overflowX) &&
        maxLeft > 0 &&
        ((event.deltaX < 0 && scrollTarget.scrollLeft > 0) ||
          (event.deltaX > 0 && scrollTarget.scrollLeft < maxLeft))
      );

      if (canMoveVertically || canMoveHorizontally) {
        scrollTarget.scrollBy(
          canMoveHorizontally ? event.deltaX : 0,
          canMoveVertically ? event.deltaY : 0,
        );
        handled = true;
        break;
      }

      if (scrollTarget.parentElement) {
        scrollTarget = scrollTarget.parentElement;
        continue;
      }
      const root = scrollTarget.getRootNode();
      scrollTarget = root instanceof ShadowRoot && root.host instanceof HTMLElement
        ? root.host
        : null;
    }

    if (!handled) {
      window.scrollBy(event.deltaX, event.deltaY);
    }
    this.scheduleRender();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!event.isTrusted || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.finish(null);
  };

  private readonly scheduleRender = (): void => {
    if (this.animationFrame || this.settled) {
      return;
    }

    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = 0;
      const nextCandidate = this.findElementAtPoint(this.pointerX, this.pointerY);

      if (nextCandidate !== this.candidate) {
        this.resizeObserver.disconnect();
        this.candidate = nextCandidate;
        if (nextCandidate) {
          this.resizeObserver.observe(nextCandidate);
        }
      }

      this.renderCandidate();
    });
  };

  private findElementAtPoint(clientX: number, clientY: number): Element | null {
    this.host.style.setProperty("pointer-events", "none", "important");
    try {
      const stacked = document.elementsFromPoint(clientX, clientY);
      let candidate = stacked.find((element) => {
        if (
          element === this.host ||
          element.closest(`[${PICKER_HOST_ATTRIBUTE}]`) ||
          element.closest("[data-lingo-frame-ui]")
        ) {
          return false;
        }

        if (element === document.documentElement || element === document.body) {
          return false;
        }

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }) ?? document.elementFromPoint(clientX, clientY);

      while (candidate?.shadowRoot) {
        const nested = candidate.shadowRoot.elementFromPoint(clientX, clientY);
        if (!nested || nested === candidate) {
          break;
        }
        candidate = nested;
      }

      return candidate === this.host ? null : candidate;
    } finally {
      this.host.style.setProperty("pointer-events", "auto", "important");
    }
  }

  private renderCandidate(): void {
    if (!this.highlight || !this.candidate || !this.candidate.isConnected) {
      if (this.highlight) {
        this.highlight.style.display = "none";
      }
      return;
    }

    this.highlight.dataset.candidate = this.candidate.localName;
    const rect = this.candidate.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.highlight.style.display = "none";
      return;
    }

    Object.assign(this.highlight.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  private finish(element: Element | null): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.abortController.abort();
    this.resizeObserver.disconnect();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    document.documentElement.classList.remove("lingo-frame-is-picking");
    this.host.remove();
    this.highlight = null;
    this.candidate = null;
    const resolve = this.resolvePick;
    this.resolvePick = null;
    resolve?.(element);
  }
}
