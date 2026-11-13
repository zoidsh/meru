import type { PowerPort, Unsubscribe } from "../../core/ports.ts";

export class FakePower implements PowerPort {
  readonly #listeners = new Set<() => void>();

  readonly onResume = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Wakes the machine, telling whoever listens. */
  readonly resume = () => {
    for (const listener of this.#listeners) {
      listener();
    }
  };
}
