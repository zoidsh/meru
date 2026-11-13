import type { KeyInput } from "../../core/engines/shortcuts.ts";
import type { KeyListener, Unsubscribe } from "../../core/ports.ts";

/** The keys typed into a fake page, which a fake window or view hands out as its own. */
export class FakeKeys {
  readonly #listeners = new Set<KeyListener>();

  readonly onKey = (listener: KeyListener): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Types a key into the page; true when a listener kept it from the page. */
  readonly press = (input: KeyInput): boolean => {
    let kept = false;
    for (const listener of this.#listeners) {
      kept = listener(input) || kept;
    }
    return kept;
  };

  /** Whether anything hears the page's keys. */
  get listening(): boolean {
    return this.#listeners.size > 0;
  }
}
