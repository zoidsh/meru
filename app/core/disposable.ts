import type { Unsubscribe } from "./ports.ts";

/** What an owner attached, undone together and once: each disposer runs on `dispose()`, the last added first, and one added after that runs at once. */
export class DisposableStore {
  readonly #disposers: Unsubscribe[] = [];
  #disposed = false;

  get disposed(): boolean {
    return this.#disposed;
  }

  add(...disposers: Unsubscribe[]): void {
    if (this.#disposed) {
      for (const disposer of disposers) {
        disposer();
      }
      return;
    }
    this.#disposers.push(...disposers);
  }

  /** Adds a disposer and hands back a call that runs it early and forgets it, for something that can go before its owner, such as a web contents destroyed while the app runs. */
  track(disposer: Unsubscribe): Unsubscribe {
    let ran = false;
    const once = () => {
      if (!ran) {
        ran = true;
        disposer();
      }
    };
    this.add(once);
    return () => {
      const index = this.#disposers.indexOf(once);
      if (index !== -1) {
        this.#disposers.splice(index, 1);
      }
      once();
    };
  }

  /** How many disposers wait for `dispose()`. */
  get size(): number {
    return this.#disposers.length;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const disposer of this.#disposers.splice(0).toReversed()) {
      disposer();
    }
  }
}
