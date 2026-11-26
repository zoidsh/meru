import { Mutex, isEqual } from "es-toolkit";

import {
  GATED_SETTINGS,
  entitledSetting,
  settingWritable,
} from "#core/entitled-settings.ts";
import type { Capability } from "#core/entitlement.ts";
import type { Platform } from "#core/platform.ts";
import {
  OVERRIDABLE_SETTING_KEYS,
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
import type { TextFile } from "#platform/text-file.ts";

import type { Profiles } from "./profiles.ts";
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
  /**
   * Whether a profile's own values apply, the entitlement's
   * `can("profiles")`, asked again at each `recheck`; while not, each reads
   * as unset and stays stored. Always when absent.
   */
  profileValues?: () => boolean;
  /**
   * The entitlement's `can`, asked at each read of a setting a capability
   * gates and again at each `recheck`; while it refuses, the setting reads
   * its free value, stays stored and is not written. Everything when absent.
   */
  can?: (capability: Capability) => boolean;
}

const GATED_KEYS = Object.keys(GATED_SETTINGS) as SettingKey[];

const overridable = new Set<SettingKey>(OVERRIDABLE_SETTING_KEYS);

const isOverridable = (key: SettingKey): key is OverridableSettingKey =>
  overridable.has(key);

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What the person chose: an app value per setting, and a profile's own value
 * of the keys it may override. A change is saved before it is committed, one
 * at a time, and announced to the listeners of each key whose app value, any
 * profile's value, or set of profiles holding a value of their own it changed.
 */
export const createSettingsStore = ({
  initial,
  save,
  platform,
  log,
  profileValues = () => true,
  can = () => true,
}: SettingsStoreDeps) => {
  const mutex = new Mutex();
  const listeners = new Map<SettingKey, Set<() => void>>();
  let settings = initial;
  let applied = profileValues();
  const grantsOf = () =>
    new Map(GATED_KEYS.map((key) => [key, settingWritable(key, can)]));
  let granted = grantsOf();

  /**
   * The app value, or the profile's where it holds one that applies; the
   * free value of either while its capability is refused.
   */
  const get = <Key extends SettingKey>(key: Key, profileId?: string) =>
    entitledSetting(
      key,
      readSetting(settings, key, platform, applied ? profileId : undefined),
      can
    );

  /**
   * Queues the write at once unless the key's capability is refused, so
   * nothing writes a value the run would not read.
   */
  const writing = (key: SettingKey, write: () => Promise<void>) =>
    settingWritable(key, can)
      ? write()
      : Promise.reject(new Error(`Setting ${key} needs Meru Pro`));

  /** Calls each listener of the keys once, however many of them it listens to. */
  const tell = (keys: Iterable<SettingKey>) => {
    const called = new Set<() => void>();

    for (const key of keys) {
      for (const listener of listeners.get(key) ?? []) {
        if (called.has(listener)) {
          continue;
        }

        called.add(listener);

        try {
          listener();
        } catch (error) {
          log(`A listener of setting ${key} failed: ${describe(error)}`);
        }
      }
    }
  };

  /**
   * Whether the app's or any profile's value of the key differs between the
   * two, or which profiles hold one of their own: Settings shows who
   * overrides a key, which changes when an override equal to the app value
   * is set or cleared.
   */
  const differs = (before: Settings, after: Settings, key: SettingKey) =>
    (isOverridable(key) &&
      !isEqual(
        overridingProfiles(before, key),
        overridingProfiles(after, key)
      )) ||
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

      if (next === settings) {
        return;
      }

      const changed = SETTING_KEYS.filter((key) =>
        differs(settings, next, key)
      );

      await save(next);
      settings = next;

      for (const changedKey of changed) {
        tell([changedKey]);
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
      writing(key, () =>
        commit((current) =>
          writeSetting(
            current,
            key,
            change(readSetting(current, key, platform))
          )
        )
      ),
    /** Sets the profile's own value, even one equal to the app's. */
    setOverride: <Key extends OverridableSettingKey>(
      profileId: string,
      key: Key,
      value: SettingValue<Key>
    ) =>
      writing(key, () =>
        commit((current) => writeOverride(current, profileId, key, value))
      ),
    /**
     * Sets the profile's own value to what `change` makes of the value it
     * reads, its own or else the app's, read after every change queued
     * before.
     */
    updateOverride: <Key extends OverridableSettingKey>(
      profileId: string,
      key: Key,
      change: (value: SettingValue<Key>) => SettingValue<Key>
    ) =>
      writing(key, () =>
        commit((current) =>
          writeOverride(
            current,
            profileId,
            key,
            change(readSetting(current, key, platform, profileId))
          )
        )
      ),
    /** The profile reads the app value again. */
    clearOverride: (profileId: string, key: OverridableSettingKey) =>
      writing(key, () =>
        commit((current) => clearOverride(current, profileId, key))
      ),
    /**
     * Saves the settings as they are, after every change queued before, for
     * a file that must exist.
     */
    saveAsIs: async () => {
      await mutex.acquire();

      try {
        await save(settings);
      } finally {
        mutex.release();
      }
    },
    /** Settles once every change asked for so far is written, for a quit to wait on. */
    settled: async () => {
      await mutex.acquire();
      mutex.release();
    },
    /** Deletes every value of the profile's own, as it is removed. */
    removeProfile: (profileId: string) =>
      commit((current) => clearProfileOverrides(current, profileId)),
    /**
     * The ids holding a value of their own for the key that applies, listed
     * or not.
     */
    overridingProfiles: (key: OverridableSettingKey) =>
      applied ? overridingProfiles(settings, key) : [],
    /**
     * Asks `profileValues` and `can` again, for a change of the entitlement,
     * and tells the listeners of every key a profile may hold when the first
     * answer changed, and of each gated key whose capability's answer did,
     * each listener once.
     */
    recheck: () => {
      const next = profileValues();
      const nextGranted = grantsOf();
      const told = new Set(
        GATED_KEYS.filter((key) => nextGranted.get(key) !== granted.get(key))
      );

      granted = nextGranted;

      if (next !== applied) {
        applied = next;

        for (const key of OVERRIDABLE_SETTING_KEYS) {
          told.add(key);
        }
      }

      tell(told);
    },
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
 * Deletes the overrides of each profile taken off the stored list, after that
 * change is committed; a profile the run only stops using keeps them. An
 * entry a crash leaves behind is inert, since a profile's id is never used
 * again.
 */
export const followRemovedProfiles = ({
  settings,
  profiles,
  log,
}: {
  settings: Pick<SettingsStore, "removeProfile">;
  profiles: Pick<Profiles, "onRemoved">;
  log: (message: string) => void;
}) => {
  const remove = async (profileId: string) => {
    try {
      await settings.removeProfile(profileId);
    } catch (error) {
      log(
        `The settings of removed profile ${profileId} were not deleted: ${describe(error)}`
      );
    }
  };

  profiles.onRemoved((profileId) => {
    void remove(profileId);
  });
};
