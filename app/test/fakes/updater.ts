import type {
  Unsubscribe,
  UpdaterEvent,
  UpdaterPort,
} from "../../core/ports.ts";

/** A feed the test scripts: each check is recorded, and events arrive when the test emits them. */
export class FakeUpdater implements UpdaterPort {
  /** The `prerelease` of every check asked for, in order. */
  readonly checks: boolean[] = [];
  installs = 0;
  /** When set, the next check rejects with it. */
  failNext: Error | undefined;
  readonly #listeners = new Set<(event: UpdaterEvent) => void>();

  readonly checkForUpdates = async ({
    prerelease,
  }: {
    readonly prerelease: boolean;
  }) => {
    this.checks.push(prerelease);
    const failure = this.failNext;
    this.failNext = undefined;
    await Promise.resolve();
    if (failure !== undefined) {
      throw failure;
    }
  };

  readonly quitAndInstall = () => {
    this.installs += 1;
  };

  readonly onEvent = (listener: (event: UpdaterEvent) => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly emit = (event: UpdaterEvent) => {
    for (const listener of this.#listeners) {
      listener(event);
    }
  };
}
