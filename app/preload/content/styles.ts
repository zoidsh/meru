import type { Unsubscribe } from "../../core/ports.ts";

/** One rule of a feature's style sheet, kept apart from its text so a test can ask what the selector matches in a fixture. */
export interface StyleRule {
  readonly selector: string;
  readonly declarations: string;
}

export const cssOf = (rules: readonly StyleRule[]): string =>
  rules.map((rule) => `${rule.selector} { ${rule.declarations} }`).join("\n");

const ATTRIBUTE = "data-meru-style";

/** A `<style>` element per feature, which the settings put up, change and take down; nothing is inserted from main. */
export class StyleLayers {
  readonly #document: Document;
  readonly #layers = new Map<string, HTMLStyleElement>();
  #waiting: Unsubscribe | undefined;

  constructor(document: Document) {
    this.#document = document;
  }

  /** Replaces the feature's sheet, or takes it down when the CSS is empty. */
  set(name: string, css: string): void {
    if (css === "") {
      this.remove(name);
      return;
    }
    const existing = this.#layers.get(name);
    if (existing !== undefined) {
      existing.textContent = css;
      return;
    }
    const style = this.#document.createElement("style");
    style.setAttribute(ATTRIBUTE, name);
    style.textContent = css;
    this.#layers.set(name, style);
    this.#attach(style);
  }

  remove(name: string): void {
    this.#layers.get(name)?.remove();
    this.#layers.delete(name);
  }

  dispose(): void {
    for (const name of this.#layers.keys()) {
      this.remove(name);
    }
    this.#waiting?.();
  }

  // A preload runs before the page is parsed, so there may be no `<head>` to put a sheet in yet.
  #attach(style: HTMLStyleElement): void {
    const parent = this.#document.head ?? this.#document.documentElement;
    if (parent === null) {
      this.#waitForDocument();
      return;
    }
    parent.append(style);
  }

  #waitForDocument(): void {
    if (this.#waiting !== undefined) {
      return;
    }
    const attach = () => {
      this.#waiting = undefined;
      for (const style of this.#layers.values()) {
        if (!style.isConnected) {
          this.#attach(style);
        }
      }
    };
    this.#document.addEventListener("DOMContentLoaded", attach, { once: true });
    this.#waiting = () => {
      this.#document.removeEventListener("DOMContentLoaded", attach);
    };
  }
}
