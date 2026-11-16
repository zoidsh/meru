import {
  createInitialState,
  decodeState,
  encodeState,
  withAProfile,
} from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TextFile } from "#platform/text-file.ts";

import { loadStore, saveStore } from "./store-file.ts";

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
 * Reads the state as `loadStore` does, with a first profile made when none
 * of the file's could be read.
 */
export const loadState = async ({
  file,
  newId,
  now,
  log,
}: StateStoreDeps): Promise<State> => {
  const loaded = await loadStore({
    file,
    name: "state",
    decode: decodeState,
    encode: encodeState,
    initial: () => createInitialState(newId),
    now,
    log,
  });
  const state = withAProfile(loaded, newId);

  if (state !== loaded) {
    // Meru still starts on the profile in memory, or it never would.
    await saveState(file, state).catch((error: unknown) => {
      log(`The new first profile was not saved: ${String(error)}`);
    });
  }

  return state;
};
