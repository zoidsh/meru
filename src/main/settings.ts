import { Mutex, isEqual } from "es-toolkit";

import {
  SETTING_KEYS,
  createInitialSettings,
  decodeSettings,
  readSetting,
  writeSetting,
} from "#core/settings.ts";
import type { SettingKey, SettingValue, Settings } from "#core/settings.ts";
import type { TextFile } from "#platform/text-file.ts";

import { loadStore, saveStore } from "./store-file.ts";

export const SETTINGS_FILE_NAME = "settings.json";

const encode = (settings: Settings): unknown => settings;

export const saveSettings = (file: TextFile, settings: Settings) =>
  saveStore({ file, encode }, settings);

export const loadSettings = (deps: {
  file: TextFile;
  now: () => number;
  log: (message: string) => void;
}) =>
  loadStore({
    ...deps,
    name: "settings",
    decode: decodeSettings,
    encode,
    initial: createInitialSettings,
  });

export interface SettingsStoreDeps {
  initial: Settings;
  save: (settings: Settings) => Promise<void>;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What the person chose. A change is saved before it is committed, one at a
 * time, and announced to the listeners of each key whose value it changed,
 * for every profile, since a global value is what a profile without an
 * override reads.
 */
export const createSettingsStore = ({
  initial,
  save,
  log,
}: SettingsStoreDeps) => {
  const mutex = new Mutex();
  const listeners = new Map<SettingKey, Set<() => void>>();
  let settings = initial;

  const get = <Key extends SettingKey>(key: Key, profileId?: string) =>
    readSetting(settings, key, profileId);

  return {
    get,
    /** Sets the global value, written before anyone reads it. */
    set: async <Key extends SettingKey>(key: Key, value: SettingValue<Key>) => {
      await mutex.acquire();

      try {
        const next = writeSetting(settings, key, value);
        const changed = SETTING_KEYS.filter(
          (candidate) =>
            !isEqual(
              readSetting(next, candidate),
              readSetting(settings, candidate)
            )
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
    },
    /** Called after each change of the key's value. */
    onChange: (key: SettingKey, listener: () => void) => {
      const forKey = listeners.get(key) ?? new Set();

      forKey.add(listener);
      listeners.set(key, forKey);
    },
  };
};

export type SettingsStore = ReturnType<typeof createSettingsStore>;
