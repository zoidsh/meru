import { clipboard } from "electron";

export interface Clipboard {
  /** Settles once the text is on the system's clipboard, or rejects. */
  writeText: (text: string) => Promise<void>;
}

export const createClipboard = (): Clipboard => ({
  writeText: (text) => clipboard.writeText(text),
});

/**
 * The end-to-end build's clipboard, which never writes the system's, shared
 * with everything else on the machine. What would be written is kept, in
 * order, on the main process's global under `meruTestClipboard`.
 */
export const createCapturedClipboard = (): Clipboard => {
  const written: string[] = [];

  Reflect.set(globalThis, "meruTestClipboard", written);

  return {
    writeText: (text) => {
      written.push(text);

      return Promise.resolve();
    },
  };
};
