import { isAnchorElement } from "../../content/query.ts";
import type { GmailFeature } from "../feature.ts";

/** How long a link is hovered before the preview gives itself the whole width, for an address too long to read. */
const LONG_HOVER = 1500;

// The keyframes are named for the preview rather than `fadeIn`, which the page may define itself.
export const URL_PREVIEW_CSS = `
@keyframes meru-url-preview-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes meru-url-preview-out { from { opacity: 1; } to { opacity: 0; } }
.meru-url-preview {
  font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  position: fixed;
  left: 0;
  bottom: 0;
  max-width: 50%;
  padding: 6px;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  background: oklch(0.145 0 0);
  color: oklch(0.985 0 0);
  transition: max-width 0.1s;
  z-index: 9999;
  animation: meru-url-preview-in 0.2s;
}
.meru-url-preview[data-long-hover="true"] { max-width: 100%; }
.meru-url-preview[data-fade-out="true"] { animation: meru-url-preview-out 0.2s; }`;

class Preview {
  readonly #document: Document;
  #element: HTMLDivElement | undefined;
  #widen: ReturnType<typeof setTimeout> | undefined;

  constructor(document: Document) {
    this.#document = document;
  }

  show(href: string): void {
    const element = this.#element;
    if (element !== undefined) {
      element.textContent = href;
      delete element.dataset.fadeOut;
      return;
    }
    const fresh = this.#document.createElement("div");
    fresh.className = "meru-url-preview";
    fresh.textContent = href;
    fresh.addEventListener("animationend", () => {
      if (fresh.dataset.fadeOut === "true") {
        this.#take();
      }
    });
    this.#document.body.append(fresh);
    this.#element = fresh;
    this.#widen = setTimeout(() => {
      fresh.dataset.longHover = "true";
    }, LONG_HOVER);
  }

  fade(): void {
    const element = this.#element;
    if (element !== undefined) {
      element.dataset.fadeOut = "true";
    }
  }

  dispose(): void {
    this.#take();
  }

  #take(): void {
    clearTimeout(this.#widen);
    this.#widen = undefined;
    this.#element?.remove();
    this.#element = undefined;
  }
}

const linkOf = (target: EventTarget | null): string | undefined => {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const anchor = target.closest("a[href]");
  return anchor !== null && isAnchorElement(anchor) ? anchor.href : undefined;
};

/** Shows where a link goes in the corner of the page, as a browser's status bar does, which a pane has none of. A link within the mailbox is Gmail's own and says nothing a reader needs. */
export const urlPreview: GmailFeature = {
  apply: ({ document, settings, style, undo }) => {
    style(URL_PREVIEW_CSS);
    const preview = new Preview(document);
    const over = (event: Event) => {
      const href = linkOf(event.target);
      if (href === undefined || href.startsWith(settings.mailbox)) {
        preview.fade();
        return;
      }
      preview.show(href);
    };
    // 3.x waited for the pointer to reach something that is not a link, so the preview stayed up once the pointer left the page.
    const out = (event: Event) => {
      if (linkOf(event.target) !== undefined) {
        preview.fade();
      }
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    undo(() => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      preview.dispose();
    });
  },
  id: "urlPreview",
};
