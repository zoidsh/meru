import type { FsPort } from "../../core/ports.ts";

export class FakeFs implements FsPort {
  readonly userDataDir = "/user-data";
  readonly files = new Map<string, string>();
  /** Every completed write, in order, as the effect a snapshot store has on disk. */
  readonly writes: { readonly name: string; readonly text: string }[] = [];
  /** Set to make every read fail, as a file the app may not open does. */
  failReads: Error | undefined;

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
}
