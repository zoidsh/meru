import { asyncNoop, noop } from "es-toolkit";

import type { Failure, LifecyclePort, Unsubscribe } from "../../core/ports.ts";

export class FakeLifecycle implements LifecyclePort {
  readonly platform: string;
  readonly packaged: boolean;
  quitting = false;
  readonly #quitTasks = new Set<() => Promise<void>>();
  readonly #allClosed = new Set<() => void>();
  readonly #failures = new Set<(failure: Failure) => void>();

  constructor(platform = "darwin", packaged = false) {
    this.platform = platform;
    this.packaged = packaged;
  }

  readonly whenReady = asyncNoop;

  readonly onWindowAllClosed = (listener: () => void): Unsubscribe => {
    this.#allClosed.add(listener);
    return () => {
      this.#allClosed.delete(listener);
    };
  };

  readonly onQuit = (task: () => Promise<void>): Unsubscribe => {
    this.#quitTasks.add(task);
    return () => {
      this.#quitTasks.delete(task);
    };
  };

  readonly quit = () => {
    void this.quitAndWait();
  };

  /** Quits as Electron would, resolving once every task the quit waits on has settled. */
  readonly quitAndWait = async () => {
    this.quitting = true;
    await Promise.allSettled(
      [...this.#quitTasks].map(async (task) => {
        await task();
      })
    );
  };

  readonly onFailure = (listener: (failure: Failure) => void): Unsubscribe => {
    this.#failures.add(listener);
    return () => {
      this.#failures.delete(listener);
    };
  };

  /** Reports a failure as Electron or Node would. */
  readonly fail = (failure: Failure) => {
    for (const listener of this.#failures) {
      listener(failure);
    }
  };

  readonly prohibitActivation = noop;
}
