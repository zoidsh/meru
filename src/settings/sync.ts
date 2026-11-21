import { useSyncExternalStore } from "react";

import type {
  SettingsBridge,
  SettingsSliceName,
  SettingsState,
} from "#contract/settings.ts";
import { createContractSync } from "#contract/sync.ts";

// Read rather than declared on `Window`, where the shell declares its own,
// which one type check of both renderers sees.
const bridge = () => Reflect.get(window, "meru") as unknown as SettingsBridge;

let connection:
  | ReturnType<typeof createContractSync<SettingsState>>
  | undefined;

const connect = () => {
  connection ??= createContractSync<SettingsState>(bridge(), [
    "settings",
    "doNotDisturb",
    "profiles",
  ]);

  return connection;
};

/** A slice of main's state, or nothing until the first snapshot. */
export const useSettingsState = <Name extends SettingsSliceName>(
  slice: Name
) => {
  const { subscribe, read } = connect();

  return useSyncExternalStore(subscribe, () => read(slice));
};

export const settingsCalls = () => bridge().calls;
