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
