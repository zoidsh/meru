import type { TextFile } from "#platform/text-file.ts";

import { openEntitlementFile } from "./entitlement.ts";
import { openSettings } from "./settings.ts";
import { openState } from "./state-store.ts";

export interface StoresDeps {
  stateFile: TextFile;
  settingsFile: TextFile;
  entitlementFile: TextFile;
  newId: () => string;
  now: () => number;
  log: (message: string) => void;
}

/**
 * Reads every store before any writes, so a file a newer Meru wrote, in any,
 * stops startup with no file changed.
 */
export const loadStores = async ({
  stateFile,
  settingsFile,
  entitlementFile,
  newId,
  now,
  log,
}: StoresDeps) => {
  const state = await openState({ file: stateFile, newId, now, log });
  const settings = await openSettings({ file: settingsFile, now, log });
  const entitlement = await openEntitlementFile({
    file: entitlementFile,
    now,
    log,
  });

  await state.settle();
  await settings.settle();
  await entitlement.settle();

  return {
    state: state.value,
    settings: settings.value,
    entitlement: entitlement.value,
  };
};
