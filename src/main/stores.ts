import type { TextFile } from "#platform/text-file.ts";

import { openSettings } from "./settings.ts";
import { openState } from "./state-store.ts";

export interface StoresDeps {
  stateFile: TextFile;
  settingsFile: TextFile;
  newId: () => string;
  now: () => number;
  log: (message: string) => void;
}

/**
 * Reads both stores before either writes, so a file a newer Meru wrote, in
 * either, stops startup with neither file changed.
 */
export const loadStores = async ({
  stateFile,
  settingsFile,
  newId,
  now,
  log,
}: StoresDeps) => {
  const state = await openState({ file: stateFile, newId, now, log });
  const settings = await openSettings({ file: settingsFile, now, log });

  await state.settle();
  await settings.settle();

  return { state: state.value, settings: settings.value };
};
