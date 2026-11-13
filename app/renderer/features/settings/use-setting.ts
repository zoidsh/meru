import { createContext, useContext } from "react";

import {
  emptySettings,
  resolve,
  withValue,
} from "../../../core/engines/settings.ts";
import {
  settings as channels,
  settingsPushes,
} from "../../../shared/channels/settings.ts";
import { registry } from "../../../shared/settings/registry.ts";
import type {
  ProfileArg,
  SettingKey,
  Settings,
} from "../../../shared/settings/registry.ts";
import { syncedStore, useStore } from "../../store.ts";
import type { Store, SyncSource } from "../../store.ts";

/** The page's copy of the settings layers, each push's changes applied to it. */
export const createSettingsStore = (
  client: SyncSource<
    (typeof channels.snapshot)["result"],
    (typeof settingsPushes.changed)["payload"]
  >
): Store<Settings> =>
  syncedStore(
    client,
    channels.snapshot,
    settingsPushes.changed,
    emptySettings(),
    (current, { changes }) => {
      let layers = current;
      for (const { key, value, profileId } of changes) {
        const next = withValue(
          registry,
          layers,
          key,
          value,
          profileId ?? undefined
        );
        if (next.ok) {
          layers = next.value;
        }
      }
      return layers;
    }
  );

export const SettingsContext = createContext<Store<Settings> | undefined>(
  undefined
);

/** The value in force for a key, for a profile when the key is one a profile may override; re-renders when it changes. */
export const useSetting = <K extends SettingKey>(
  key: K,
  ...profile: ProfileArg<K>
) => {
  const store = useContext(SettingsContext);
  if (store === undefined) {
    throw new Error("useSetting needs a SettingsContext above it");
  }
  const [profileId] = profile;
  return useStore(store, (settings) =>
    resolve(registry, settings, key, profileId)
  );
};

const same = <T>(value: T) => value;

/** Every layer as the page holds it, for a page that reads keys it only knows at run time, such as the settings page. */
export const useSettingsLayers = (): Settings => {
  const store = useContext(SettingsContext);
  if (store === undefined) {
    throw new Error("useSettingsLayers needs a SettingsContext above it");
  }
  return useStore(store, same);
};
