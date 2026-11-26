import { delay } from "es-toolkit";

import { fakeTextFile } from "#platform/text-file.fake.ts";
import type { TextFile } from "#platform/text-file.ts";

/**
 * A file in memory whose every write stays in flight until the test lets it
 * land with `land`, oldest first.
 */
export const heldTextFile = (path: string) => {
  const files = new Map<string, string>();
  const inMemory = fakeTextFile(path, files);
  const waiting: (() => void)[] = [];

  const file: TextFile = {
    ...inMemory,
    write: async (text) => {
      const { promise, resolve } = Promise.withResolvers<undefined>();

      waiting.push(() => {
        resolve(undefined);
      });
      await promise;
      await inMemory.write(text);
    },
  };

  return {
    file,
    /** What has landed. */
    read: () => files.get(path),
    /** Writes started and not yet let land. */
    inFlight: () => waiting.length,
    land: () => {
      waiting.shift()?.();
    },
  };
};

/** Whether `promise` has settled once everything already able to move has. */
export const hasSettled = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(() => true).catch(() => true),
    delay(0).then(() => false),
  ]);
