// Only the suite's build calls these, behind `MERU_E2E_BUILD`, and a release
// build fails if any global's name here is in its output.

import type { GmailHealth } from "#contract/gmail.ts";
import type { SoundRequest } from "#contract/shell-sound.ts";
import type {
  OverridableSettingKey,
  SettingKey,
  SettingValue,
} from "#core/settings.ts";
import type { TabKey } from "#core/tabs.ts";

import type { Entitlement } from "./entitlement.ts";
import type { SettingsStore } from "./settings.ts";

/**
 * What Gmail's pages reported and what was refused, in order, on the main
 * process's global under `meruTestGmailPage`.
 */
export const captureGmailPage = () => {
  const captured = {
    health: [] as (TabKey & GmailHealth)[],
    refused: [] as (string | undefined)[],
  };

  Reflect.set(globalThis, "meruTestGmailPage", captured);

  return {
    onHealth: (key: TabKey, health: GmailHealth) => {
      captured.health.push({ ...key, ...health });
    },
    onRefused: (origin: string | undefined) => {
      captured.refused.push(origin);
    },
  };
};

/**
 * Each sound asked for, in order, on the main process's global under
 * `meruTestSounds`, in place of playing it: the suite never makes a sound.
 */
export const captureSounds = () => {
  const captured: SoundRequest[] = [];

  Reflect.set(globalThis, "meruTestSounds", captured);

  return (request: SoundRequest) => {
    captured.push(request);
  };
};

/** What the entitlement answers, on the main process's global under `meruTestEntitlement`. */
export const exposeTestEntitlement = (entitlement: Entitlement) => {
  Reflect.set(globalThis, "meruTestEntitlement", {
    snapshot: entitlement.snapshot,
    can: entitlement.can,
    activate: entitlement.activate,
  });
};

/**
 * Sets a setting, or a profile's own value of one, as a settings page would,
 * under `meruTestSettings`.
 */

export const exposeTestSettings = (settings: SettingsStore) => {
  Reflect.set(globalThis, "meruTestSettings", {
    set: <Key extends SettingKey>(key: Key, value: SettingValue<Key>) =>
      settings.update(key, () => value),
    setOverride: <Key extends OverridableSettingKey>(
      profileId: string,
      key: Key,
      value: SettingValue<Key>
    ) => settings.setOverride(profileId, key, value),
    clearOverride: (profileId: string, key: OverridableSettingKey) =>
      settings.clearOverride(profileId, key),
  });
};
