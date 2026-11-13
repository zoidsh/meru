import type { ThemePort, Unsubscribe } from "../../core/ports.ts";

export class FakeTheme implements ThemePort {
  #dark: boolean;
  readonly #listeners = new Set<() => void>();

  constructor(dark = false) {
    this.#dark = dark;
  }

  readonly dark = () => this.#dark;

  readonly onChange = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Switches the operating system's appearance, telling whoever listens. */
  readonly set = (dark: boolean) => {
    this.#dark = dark;
    for (const listener of this.#listeners) {
      listener();
    }
  };
}
