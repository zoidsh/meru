import type { AppPort, Unsubscribe } from "../../core/ports.ts";

export class FakeApp implements AppPort {
  readonly platform: string;
  readonly packaged: boolean;
  quitting = false;
  ready = false;
  activationProhibited = false;
  readonly #quitTasks = new Set<() => Promise<void>>();
  readonly #allClosed = new Set<() => void>();

  constructor(platform = "darwin", packaged = false) {
    this.platform = platform;
    this.packaged = packaged;
  }

  readonly whenReady = async () => {
    await Promise.resolve();
    this.ready = true;
  };

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

  readonly prohibitActivation = () => {
    this.activationProhibited = true;
  };
}
