import { createContext, useContext } from "react";

import {
  emptySettings,
  forPlatform,
  resolve,
  withValue,
} from "../../../core/engines/settings.ts";
import type { GateRefusal } from "../../../core/entitlement/gate.ts";
import type { Platform } from "../../../core/records/platform.ts";
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
import type { Locked } from "../../../shared/settings/schema.ts";
import { syncedStore, useStore } from "../../store.ts";
import type { Store, SyncSource } from "../../store.ts";

/** The page's copy of the settings: the layers, and the keys the entitlement locks at their default. */
interface SettingsCopy {
  readonly layers: Settings;
  readonly locked: Locked;
}

/** The registry as the page's platform has it, each platform default in the place of the default. */
type PlatformRegistry = readonly (typeof registry)[number][];

/** The page's copy of the settings, and the registry its values resolve against. */
interface SettingsSource {
  readonly store: Store<SettingsCopy>;
  readonly specs: PlatformRegistry;
}

/** The page's copy of the settings, each push's changes applied to its layers and its locks replaced. */
export const createSettingsStore = (
  client: SyncSource<
    (typeof channels.snapshot)["result"],
    (typeof settingsPushes.changed)["payload"]
  > & { readonly platform: Platform }
): SettingsSource => ({
  specs: forPlatform(registry, client.platform),
  store: syncedStore(
    client,
    channels.snapshot,
    settingsPushes.changed,
    { layers: emptySettings(), locked: {} },
    (current, { changes, locked }) => {
      let { layers } = current;
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
      return { layers, locked };
    }
  ),
});

export const SettingsContext = createContext<SettingsSource | undefined>(
  undefined
);

const useSettingsSource = (): SettingsSource => {
  const source = useContext(SettingsContext);
  if (source === undefined) {
    throw new Error("useSetting needs a SettingsContext above it");
  }
  return source;
};

const useSettingsStore = (): Store<SettingsCopy> => useSettingsSource().store;

/** The registry the page's values resolve against. */
export const useSettingSpecs = (): PlatformRegistry =>
  useSettingsSource().specs;

/** The value in force for a key, for a profile when the key is one a profile may override, its default while the key is locked; re-renders when it changes. */
export const useSetting = <K extends SettingKey>(
  key: K,
  ...profile: ProfileArg<K>
) => {
  const [profileId] = profile;
  const { specs, store } = useSettingsSource();
  return useStore(store, ({ layers, locked }) =>
    resolve(
      specs,
      locked[key] === undefined ? layers : emptySettings(),
      key,
      profileId
    )
  );
};

/** Every layer as the page holds it, for a page that reads keys it only knows at run time, such as the settings page. */
export const useSettingsLayers = (): Settings =>
  useStore(useSettingsStore(), ({ layers }) => layers);

/** Why the entitlement locks the key at its default; undefined while it may change. */
export const useLocked = (key: SettingKey): GateRefusal | undefined =>
  useStore(useSettingsStore(), ({ locked }) => locked[key]);
