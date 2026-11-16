import {
  createInitialState,
  decodeState,
  encodeState,
  withAProfile,
} from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TextFile } from "#platform/text-file.ts";

import { openStore, saveStore } from "./store-file.ts";
import type { OpenedStore } from "./store-file.ts";

export const STATE_FILE_NAME = "state.json";

export interface StateStoreDeps {
  file: TextFile;
  newId: () => string;
  now: () => number;
  log: (message: string) => void;
}

/** Replaces the file whole; the caller sends one write at a time. */
export const saveState = (file: TextFile, state: State) =>
  saveStore({ file, encode: encodeState }, state);

/**
 * Opens the state as `openStore` does, with a first profile made when none
 * of the file's could be read, saved when the store settles.
 */
export const openState = async ({
  file,
  newId,
  now,
  log,
}: StateStoreDeps): Promise<OpenedStore<State>> => {
  const opened = await openStore({
    file,
    name: "state",
    decode: decodeState,
    encode: encodeState,
    initial: () => createInitialState(newId),
    now,
    log,
  });
  const state = withAProfile(opened.value, newId);

  return {
    value: state,
    settle: async () => {
      await opened.settle();

      if (state !== opened.value) {
        // Meru still starts on the profile in memory, or it never would.
        await saveState(file, state).catch((error: unknown) => {
          log(`The new first profile was not saved: ${String(error)}`);
        });
      }
    },
  };
};
