import { Mutex, isEqual } from "es-toolkit";

import type { Platform } from "#core/platform.ts";
import {
  SETTING_KEYS,
  clearOverride,
  clearProfileOverrides,
  createInitialSettings,
  decodeSettings,
  overridingProfiles,
  profilesWithEntries,
  readSetting,
  writeOverride,
  writeSetting,
} from "#core/settings.ts";
import type {
  OverridableSettingKey,
  SettingKey,
  SettingValue,
  Settings,
} from "#core/settings.ts";
import type { State } from "#core/state.ts";
import type { TextFile } from "#platform/text-file.ts";

import { openStore, saveStore } from "./store-file.ts";

export const SETTINGS_FILE_NAME = "settings.json";

const encode = (settings: Settings): unknown => settings;

export const saveSettings = (file: TextFile, settings: Settings) =>
  saveStore({ file, encode }, settings);

/** Opens the settings as `openStore` does. */
export const openSettings = (deps: {
  file: TextFile;
  now: () => number;
  log: (message: string) => void;
}) =>
  openStore({
    ...deps,
    name: "settings",
    decode: decodeSettings,
    encode,
    initial: createInitialSettings,
  });

export interface SettingsStoreDeps {
  initial: Settings;
  save: (settings: Settings) => Promise<void>;
  /** Picks the defaults that differ by platform. */
  platform: Platform;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What the person chose: an app value per setting, and a profile's own value
 * of the keys it may override. A change is saved before it is committed, one
 * at a time, and announced to the listeners of each key whose app value or
 * any profile's value it changed.
 */
export const createSettingsStore = ({
  initial,
  save,
  platform,
  log,
}: SettingsStoreDeps) => {
  const mutex = new Mutex();
  const listeners = new Map<SettingKey, Set<() => void>>();
  let settings = initial;

  /** The app value, or the profile's where it holds one of its own. */
  const get = <Key extends SettingKey>(key: Key, profileId?: string) =>
    readSetting(settings, key, platform, profileId);

  /** Whether the app's or any profile's value of the key differs between the two. */
  const differs = (before: Settings, after: Settings, key: SettingKey) =>
    [
      undefined,
      ...new Set([
        ...profilesWithEntries(before),
        ...profilesWithEntries(after),
      ]),
    ].some(
      (profileId) =>
        !isEqual(
          readSetting(before, key, platform, profileId),
          readSetting(after, key, platform, profileId)
        )
    );

  /** Writes what `change` makes of the settings, read after every change queued before. */
  const commit = async (change: (current: Settings) => Settings) => {
    await mutex.acquire();

    try {
      const next = change(settings);
      const changed = SETTING_KEYS.filter((key) =>
        differs(settings, next, key)
      );

      await save(next);
      settings = next;

      for (const changedKey of changed) {
        for (const listener of listeners.get(changedKey) ?? []) {
          try {
            listener();
          } catch (error) {
            log(
              `A listener of setting ${changedKey} failed: ${describe(error)}`
            );
          }
        }
      }
    } finally {
      mutex.release();
    }
  };

  return {
    get,
    /**
     * Sets the app value to what `change` makes of it, read after every
     * change queued before; no profile's own value is touched.
     */
    update: <Key extends SettingKey>(
      key: Key,
      change: (value: SettingValue<Key>) => SettingValue<Key>
    ) =>
      commit((current) =>
        writeSetting(current, key, change(readSetting(current, key, platform)))
      ),
    /** Sets the profile's own value, even one equal to the app's. */
    setOverride: <Key extends OverridableSettingKey>(
      profileId: string,
      key: Key,
      value: SettingValue<Key>
    ) => commit((current) => writeOverride(current, profileId, key, value)),
    /** The profile reads the app value again. */
    clearOverride: (profileId: string, key: OverridableSettingKey) =>
      commit((current) => clearOverride(current, profileId, key)),
    /** Deletes every value of the profile's own, as it is removed. */
    removeProfile: (profileId: string) =>
      commit((current) => clearProfileOverrides(current, profileId)),
    /** The ids holding a value of their own for the key, listed or not. */
    overridingProfiles: (key: OverridableSettingKey) =>
      overridingProfiles(settings, key),
    /** Called after each change of the key's app value or a profile's. */
    onChange: (key: SettingKey, listener: () => void) => {
      const forKey = listeners.get(key) ?? new Set();

      forKey.add(listener);
      listeners.set(key, forKey);
    },
  };
};

export type SettingsStore = ReturnType<typeof createSettingsStore>;

/**
 * Deletes the overrides of each profile a change of the state no longer
 * lists, after that change is committed. An entry a crash leaves behind is
 * inert, since a profile's id is never used again.
 */
export const followRemovedProfiles = ({
  settings,
  profiles,
  log,
}: {
  settings: Pick<SettingsStore, "removeProfile">;
  profiles: {
    get: () => State;
    onChange: (listener: (state: State) => void) => unknown;
  };
  log: (message: string) => void;
}) => {
  let listed = new Set(profiles.get().profiles.map((profile) => profile.id));

  const remove = async (profileId: string) => {
    try {
      await settings.removeProfile(profileId);
    } catch (error) {
      log(
        `The settings of removed profile ${profileId} were not deleted: ${describe(error)}`
      );
    }
  };

  profiles.onChange((state) => {
    const next = new Set(state.profiles.map((profile) => profile.id));

    for (const profileId of listed) {
      if (!next.has(profileId)) {
        void remove(profileId);
      }
    }

    listed = next;
  });
};
