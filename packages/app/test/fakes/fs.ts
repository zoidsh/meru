import type { FsPort, Unsubscribe } from "../../core/ports.ts";

export class FakeFs implements FsPort {
  readonly userDataDir = "/user-data";
  readonly files = new Map<string, string>();
  /** Every completed write, in order, as the effect a snapshot store has on disk. */
  readonly writes: { readonly name: string; readonly text: string }[] = [];
  /** Set to make every read fail, as a file the app may not open does. */
  failReads: Error | undefined;
  readonly #watchers = new Map<string, Set<() => void>>();

  constructor(files: Readonly<Record<string, string>> = {}) {
    for (const [name, text] of Object.entries(files)) {
      this.files.set(name, text);
    }
  }

  readonly readText = async (name: string) => {
    await Promise.resolve();
    if (this.failReads !== undefined) {
      throw this.failReads;
    }
    return this.files.get(name);
  };

  readonly writeTextAtomic = async (name: string, text: string) => {
    await Promise.resolve();
    this.files.set(name, text);
    this.writes.push({ name, text });
  };

  readonly exists = async (name: string) => {
    await Promise.resolve();
    return this.files.has(name);
  };

  readonly watch = (name: string, listener: () => void): Unsubscribe => {
    const listeners = this.#watchers.get(name) ?? new Set();
    listeners.add(listener);
    this.#watchers.set(name, listeners);
    return () => {
      listeners.delete(listener);
    };
  };

  /** Changes a file as an editor would, outside the app, and tells whoever watches it. */
  readonly edit = (name: string, text: string) => {
    this.files.set(name, text);
    for (const listener of this.#watchers.get(name) ?? []) {
      listener();
    }
  };

  get watched(): number {
    return [...this.#watchers.values()].reduce((sum, set) => sum + set.size, 0);
  }
}
