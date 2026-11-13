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
import type { RendererSurface } from "../../../shared/channels/surfaces.ts";
import { registry } from "../../../shared/settings/registry.ts";
import type {
  ProfileSettingKey,
  SettingKey,
  Settings,
} from "../../../shared/settings/registry.ts";
import type { Client } from "../../client.ts";
import { createStore, useStore } from "../../store.ts";
import type { Store } from "../../store.ts";

/** The page's copy of the settings layers: seeded once, then kept by the main process's pushes. */
export const createSettingsStore = (
  client: Client<RendererSurface>
): Store<Settings> => {
  const seed = client.sendSync(channels.snapshot, {});
  const store = createStore<Settings>(seed.ok ? seed.value : emptySettings());
  client.on(settingsPushes.changed, ({ changes }) => {
    store.set((current) => {
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
    });
  });
  return store;
};

export const SettingsContext = createContext<Store<Settings> | undefined>(
  undefined
);

/** The value in force for a key, for a profile when the key is one a profile may override; re-renders when it changes. */
export const useSetting = <K extends SettingKey>(
  key: K,
  ...profile: K extends ProfileSettingKey ? [profileId?: string] : []
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
